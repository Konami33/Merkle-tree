const logger = require('../utils/logger');
const redisService = require('./redisService');

let dbPool = null;
let config = null;

function init(pool, appConfig) {
    dbPool = pool;
    config = appConfig;
}

async function syncTree(treeData) {
    const { root, treeLevels, leafCount, sourcePath } = treeData;
    
    if (!root || !root.hash) {
        throw new Error('Invalid tree data: missing root hash');
    }

    try {
        // Get latest root hash (with caching)
        const latestRootHash = await getLatestRootHash();
        
        // Check if root hash has changed
        if (latestRootHash === root.hash) {
            logger.info('Root hash unchanged, skipping database write', {
                rootHash: root.hash,
                leafCount
            });
            
            return {
                written: false,
                rootHash: root.hash,
                reason: 'unchanged'
            };
        }

        // Insert new tree into database
        const result = await insertNewTree(root.hash, root, leafCount, sourcePath);
        
        // Update cache with new root hash and metadata
        await redisService.setLatestRootHash(root.hash, {
            rootId: result.rootId,
            leafCount,
            sourcePath,
            previousHash: latestRootHash
        });
        
        // Cache tree metadata
        await redisService.setTreeMetadata(root.hash, {
            rootId: result.rootId,
            itemCount: leafCount,
            sourcePath,
            createdAt: new Date().toISOString()
        });
        
        logger.info('New tree saved to database and cache updated', {
            rootId: result.rootId,
            rootHash: root.hash,
            leafCount,
            previousHash: latestRootHash
        });

        return {
            written: true,
            rootId: result.rootId,
            rootHash: root.hash,
            previousHash: latestRootHash,
            leafCount
        };

    } catch (error) {
        logger.error('Database sync failed:', error);
        throw new Error(`Failed to sync tree: ${error.message}`);
    }
}

async function getLatestRootHash() {
    // Try to get from cache first
    const cachedData = await redisService.getLatestRootHash();
    if (cachedData && cachedData.rootHash) {
        logger.debug('Retrieved latest root hash from cache:', cachedData.rootHash);
        return cachedData.rootHash;
    }
    
    // Fallback to database
    const client = await dbPool.connect();
    
    try {
        const query = 'SELECT root_hash FROM merkle_roots ORDER BY created_at DESC LIMIT 1';
        const result = await client.query(query);
        
        const rootHash = result.rows.length > 0 ? result.rows[0].root_hash : null;
        
        // Cache the result if found
        if (rootHash) {
            await redisService.setLatestRootHash(rootHash, { source: 'database' });
            logger.debug('Cached latest root hash from database:', rootHash);
        }
        
        return rootHash;
    } finally {
        client.release();
    }
}

async function insertNewTree(rootHash, treeJson, itemCount, sourcePath) {
    const client = await dbPool.connect();
    
    try {
        await client.query('BEGIN');

        // Insert root record
        const rootQuery = `
            INSERT INTO merkle_roots (root_hash, item_count, source_path) 
            VALUES ($1, $2, $3) 
            RETURNING id
        `;
        const rootResult = await client.query(rootQuery, [rootHash, itemCount, sourcePath]);
        const rootId = rootResult.rows[0].id;

        // Insert tree data
        const treeQuery = `
            INSERT INTO merkle_tree_data (root_id, tree_json) 
            VALUES ($1, $2)
        `;
        await client.query(treeQuery, [rootId, JSON.stringify(treeJson)]);

        await client.query('COMMIT');
        
        return { rootId };

    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function getTreeByRootHash(rootHash) {
    // Try cache first
    const cachedMetadata = await redisService.getTreeMetadata(rootHash);
    if (cachedMetadata) {
        logger.debug('Retrieved tree metadata from cache for hash:', rootHash);
        // If we have cached metadata, we might not need the full tree JSON
        // Return cached data if it's sufficient
    }
    
    const client = await dbPool.connect();
    
    try {
        const query = `
            SELECT 
                mr.id,
                mr.root_hash,
                mr.item_count,
                mr.source_path,
                mr.created_at,
                mtd.tree_json
            FROM merkle_roots mr
            JOIN merkle_tree_data mtd ON mr.id = mtd.root_id
            WHERE mr.root_hash = $1
        `;
        
        const result = await client.query(query, [rootHash]);
        
        if (result.rows.length === 0) {
            return null;
        }

        const row = result.rows[0];
        const treeData = {
            id: row.id,
            rootHash: row.root_hash,
            itemCount: row.item_count,
            sourcePath: row.source_path,
            createdAt: row.created_at,
            treeJson: row.tree_json
        };
        
        // Cache the metadata for future use
        await redisService.setTreeMetadata(rootHash, {
            rootId: row.id,
            itemCount: row.item_count,
            sourcePath: row.source_path,
            createdAt: row.created_at
        });
        
        return treeData;

    } finally {
        client.release();
    }
}

async function getRecentRoots(limit = 10) {
    const client = await dbPool.connect();
    
    try {
        const query = `
            SELECT 
                id,
                root_hash,
                item_count,
                source_path,
                created_at
            FROM merkle_roots 
            ORDER BY created_at DESC 
            LIMIT $1
        `;
        
        const result = await client.query(query, [limit]);
        return result.rows;

    } finally {
        client.release();
    }
}

async function testConnection() {
    const client = await dbPool.connect();
    
    try {
        const result = await client.query('SELECT NOW() as current_time');
        return {
            connected: true,
            timestamp: result.rows[0].current_time
        };
    } catch (error) {
        return {
            connected: false,
            error: error.message
        };
    } finally {
        client.release();
    }
}

async function getStats() {
    const client = await dbPool.connect();
    
    try {
        const statsQuery = `
            SELECT 
                COUNT(*) as total_trees,
                MAX(created_at) as latest_tree,
                MIN(created_at) as earliest_tree,
                AVG(item_count) as avg_item_count
            FROM merkle_roots
        `;
        
        const result = await client.query(statsQuery);
        return result.rows[0];

    } finally {
        client.release();
    }
}

async function clearCache() {
    try {
        await redisService.invalidateCache('merkle:*');
        logger.info('Database-related cache cleared');
        return true;
    } catch (error) {
        logger.error('Error clearing cache:', error);
        return false;
    }
}

async function warmupCache() {
    try {
        logger.info('Warming up cache...');
        
        // Warm up latest root hash
        const latestHash = await getLatestRootHash();
        if (latestHash) {
            logger.info('Cache warmed up with latest root hash:', latestHash);
        }
        
        // Warm up recent roots metadata
        const recentRoots = await getRecentRoots(5);
        for (const root of recentRoots) {
            await redisService.setTreeMetadata(root.root_hash, {
                rootId: root.id,
                itemCount: root.item_count,
                sourcePath: root.source_path,
                createdAt: root.created_at
            });
        }
        
        logger.info(`Cache warmed up with ${recentRoots.length} recent trees`);
        return true;
    } catch (error) {
        logger.error('Error warming up cache:', error);
        return false;
    }
}

module.exports = {
    init,
    syncTree,
    getLatestRootHash,
    insertNewTree,
    getTreeByRootHash,
    getRecentRoots,
    testConnection,
    getStats,
    clearCache,
    warmupCache
};