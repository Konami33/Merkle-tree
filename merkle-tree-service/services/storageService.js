const logger = require('../utils/logger');
const redisService = require('./redisService');
const s3Service = require('./s3Service');

// Legacy PostgreSQL imports
const { Pool } = require('pg');

let dbPool = null;
let config = null;
let storageMode = 'postgresql'; // 'postgresql' or 's3'

function init(appConfig) {
    config = appConfig;
    
    // Determine storage mode based on configuration
    if (config.S3_ENABLED) {
        storageMode = 's3';
        logger.info('Storage mode: S3 (MinIO)');
        return initS3Storage();
    } else {
        storageMode = 'postgresql';
        logger.info('Storage mode: PostgreSQL');
        return initPostgreSQLStorage(appConfig);
    }
}

async function initS3Storage() {
    try {
        await s3Service.init(config);
        logger.info('S3 storage initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize S3 storage:', error);
        throw error;
    }
}

async function initPostgreSQLStorage(pool) {
    dbPool = pool;
    logger.info('PostgreSQL storage initialized');
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
            logger.info('Root hash unchanged, skipping storage write', {
                rootHash: root.hash,
                leafCount,
                storageMode
            });
            
            return {
                written: false,
                rootHash: root.hash,
                reason: 'unchanged',
                storageMode
            };
        }

        let result;
        
        if (storageMode === 's3') {
            // Store in S3
            result = await s3Service.storeTreeData(root.hash, root, {
                itemCount: leafCount,
                sourcePath
            });
        } else {
            // Store in PostgreSQL (legacy)
            result = await insertNewTreePostgreSQL(root.hash, root, leafCount, sourcePath);
        }
        
        // Update cache with new root hash and metadata
        await redisService.setLatestRootHash(root.hash, {
            rootId: result.treeId || result.rootId,
            leafCount,
            sourcePath,
            previousHash: latestRootHash,
            storageMode
        });
        
        // Cache tree metadata
        await redisService.setTreeMetadata(root.hash, {
            rootId: result.treeId || result.rootId,
            itemCount: leafCount,
            sourcePath,
            createdAt: new Date().toISOString(),
            storageMode
        });
        
        logger.info('New tree saved to storage and cache updated', {
            rootId: result.treeId || result.rootId,
            rootHash: root.hash,
            leafCount,
            previousHash: latestRootHash,
            storageMode
        });

        return {
            written: true,
            rootId: result.treeId || result.rootId,
            rootHash: root.hash,
            previousHash: latestRootHash,
            leafCount,
            storageMode
        };

    } catch (error) {
        logger.error('Storage sync failed:', error);
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
    
    // Fallback to storage
    let rootHash;
    
    if (storageMode === 's3') {
        rootHash = await s3Service.getLatestRootHash();
    } else {
        rootHash = await getLatestRootHashPostgreSQL();
    }
    
    // Cache the result if found
    if (rootHash) {
        await redisService.setLatestRootHash(rootHash, { 
            source: storageMode,
            retrievedAt: new Date().toISOString()
        });
        logger.debug('Cached latest root hash from storage:', rootHash);
    }
    
    return rootHash;
}

async function getTreeByRootHash(rootHash) {
    // Try cache first for metadata
    const cachedMetadata = await redisService.getTreeMetadata(rootHash);
    if (cachedMetadata) {
        logger.debug('Retrieved tree metadata from cache for hash:', rootHash);
    }
    
    let treeData;
    
    if (storageMode === 's3') {
        treeData = await s3Service.getTreeByRootHash(rootHash);
    } else {
        treeData = await getTreeByRootHashPostgreSQL(rootHash);
    }
    
    if (treeData) {
        // Cache the metadata for future use
        await redisService.setTreeMetadata(rootHash, {
            rootId: treeData.id,
            itemCount: treeData.itemCount,
            sourcePath: treeData.sourcePath,
            createdAt: treeData.createdAt,
            storageMode
        });
    }
    
    return treeData;
}

async function getRecentRoots(limit = 10) {
    if (storageMode === 's3') {
        return await s3Service.getRecentRoots(limit);
    } else {
        return await getRecentRootsPostgreSQL(limit);
    }
}

async function testConnection() {
    try {
        if (storageMode === 's3') {
            const s3Health = await s3Service.testConnection();
            return {
                connected: s3Health.connected,
                timestamp: s3Health.timestamp,
                storageMode: 's3',
                endpoint: s3Health.endpoint,
                bucket: s3Health.bucket,
                error: s3Health.error
            };
        } else {
            const client = await dbPool.connect();
            const result = await client.query('SELECT NOW() as current_time');
            client.release();
            
            return {
                connected: true,
                timestamp: result.rows[0].current_time,
                storageMode: 'postgresql'
            };
        }
    } catch (error) {
        return {
            connected: false,
            error: error.message,
            storageMode
        };
    }
}

async function getStats() {
    if (storageMode === 's3') {
        const s3Stats = await s3Service.getStats();
        return {
            ...s3Stats,
            storageMode: 's3'
        };
    } else {
        return await getStatsPostgreSQL();
    }
}

// Legacy PostgreSQL functions
async function getLatestRootHashPostgreSQL() {
    const client = await dbPool.connect();
    
    try {
        const query = 'SELECT root_hash FROM merkle_roots ORDER BY created_at DESC LIMIT 1';
        const result = await client.query(query);
        
        return result.rows.length > 0 ? result.rows[0].root_hash : null;
    } finally {
        client.release();
    }
}

async function insertNewTreePostgreSQL(rootHash, treeJson, itemCount, sourcePath) {
    const client = await dbPool.connect();
    
    try {
        await client.query('BEGIN');

        const rootQuery = `
            INSERT INTO merkle_roots (root_hash, item_count, source_path) 
            VALUES ($1, $2, $3) 
            RETURNING id
        `;
        const rootResult = await client.query(rootQuery, [rootHash, itemCount, sourcePath]);
        const rootId = rootResult.rows[0].id;

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

async function getTreeByRootHashPostgreSQL(rootHash) {
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
        return {
            id: row.id,
            rootHash: row.root_hash,
            itemCount: row.item_count,
            sourcePath: row.source_path,
            createdAt: row.created_at,
            treeJson: row.tree_json
        };

    } finally {
        client.release();
    }
}

async function getRecentRootsPostgreSQL(limit = 10) {
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

async function getStatsPostgreSQL() {
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
        return {
            ...result.rows[0],
            storageMode: 'postgresql'
        };

    } finally {
        client.release();
    }
}

async function clearCache() {
    try {
        await redisService.invalidateCache('merkle:*');
        logger.info('Storage-related cache cleared');
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
                createdAt: root.created_at,
                storageMode
            });
        }
        
        logger.info(`Cache warmed up with ${recentRoots.length} recent trees`);
        return true;
    } catch (error) {
        logger.error('Error warming up cache:', error);
        return false;
    }
}

function getStorageMode() {
    return storageMode;
}

module.exports = {
    init,
    syncTree,
    getLatestRootHash,
    getTreeByRootHash,
    getRecentRoots,
    testConnection,
    getStats,
    clearCache,
    warmupCache,
    getStorageMode
};
