const logger = require('../utils/logger');

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
        // Get latest root hash from database
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
        
        logger.info('New tree saved to database', {
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
    const client = await dbPool.connect();
    
    try {
        const query = 'SELECT root_hash FROM merkle_roots ORDER BY created_at DESC LIMIT 1';
        const result = await client.query(query);
        
        return result.rows.length > 0 ? result.rows[0].root_hash : null;
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

module.exports = {
    init,
    syncTree,
    getLatestRootHash,
    insertNewTree,
    getTreeByRootHash,
    getRecentRoots,
    testConnection,
    getStats
};