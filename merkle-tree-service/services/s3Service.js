const Minio = require('minio');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

let minioClient = null;
let config = null;
let isConnected = false;

// S3 object key patterns
const OBJECT_KEYS = {
    ROOT_METADATA: 'metadata/roots/',
    TREE_DATA: 'trees/',
    LATEST_ROOT: 'metadata/latest-root.json'
};

async function init(appConfig) {
    config = appConfig;
    
    if (!config.S3_ENABLED) {
        logger.info('S3 storage is disabled');
        return;
    }

    try {
        // Create MinIO client
        minioClient = new Minio.Client({
            endPoint: config.S3_ENDPOINT,
            port: config.S3_PORT,
            useSSL: config.S3_USE_SSL,
            accessKey: config.S3_ACCESS_KEY,
            secretKey: config.S3_SECRET_KEY,
            region: config.S3_REGION
        });

        // Test connection and create bucket if needed
        await ensureBucketExists();
        
        isConnected = true;
        logger.info('MinIO/S3 service initialized successfully', {
            endpoint: config.S3_ENDPOINT,
            port: config.S3_PORT,
            bucket: config.S3_BUCKET_NAME
        });
        
    } catch (error) {
        logger.error('Failed to initialize MinIO/S3 service:', error);
        isConnected = false;
        throw error;
    }
}

async function ensureBucketExists() {
    try {
        const bucketExists = await minioClient.bucketExists(config.S3_BUCKET_NAME);
        
        if (!bucketExists) {
            await minioClient.makeBucket(config.S3_BUCKET_NAME, config.S3_REGION);
            logger.info(`Created S3 bucket: ${config.S3_BUCKET_NAME}`);
        } else {
            logger.info(`S3 bucket exists: ${config.S3_BUCKET_NAME}`);
        }
    } catch (error) {
        logger.error('Error ensuring bucket exists:', error);
        throw error;
    }
}

async function storeTreeData(rootHash, treeData, metadata) {
    if (!isConnected) {
        throw new Error('S3 service not connected');
    }

    try {
        const treeId = uuidv4();
        const timestamp = new Date().toISOString();
        
        // Prepare metadata object
        const rootMetadata = {
            id: treeId,
            rootHash,
            itemCount: metadata.itemCount,
            sourcePath: metadata.sourcePath,
            createdAt: timestamp,
            treeObjectKey: `${OBJECT_KEYS.TREE_DATA}${rootHash}.json`
        };

        // Store tree JSON data
        const treeObjectKey = `${OBJECT_KEYS.TREE_DATA}${rootHash}.json`;
        await minioClient.putObject(
            config.S3_BUCKET_NAME,
            treeObjectKey,
            JSON.stringify(treeData),
            {
                'Content-Type': 'application/json',
                'x-amz-meta-root-hash': rootHash,
                'x-amz-meta-created-at': timestamp,
                'x-amz-meta-item-count': metadata.itemCount.toString()
            }
        );

        // Store root metadata
        const metadataObjectKey = `${OBJECT_KEYS.ROOT_METADATA}${rootHash}.json`;
        await minioClient.putObject(
            config.S3_BUCKET_NAME,
            metadataObjectKey,
            JSON.stringify(rootMetadata),
            {
                'Content-Type': 'application/json',
                'x-amz-meta-type': 'root-metadata'
            }
        );

        // Update latest root pointer
        await updateLatestRoot(rootMetadata);

        logger.info('Tree data stored successfully in S3', {
            rootHash,
            treeId,
            itemCount: metadata.itemCount
        });

        return {
            treeId,
            rootHash,
            treeObjectKey,
            metadataObjectKey
        };

    } catch (error) {
        logger.error('Error storing tree data in S3:', error);
        throw new Error(`Failed to store tree data: ${error.message}`);
    }
}

async function getLatestRootHash() {
    if (!isConnected) {
        throw new Error('S3 service not connected');
    }

    try {
        const stream = await minioClient.getObject(config.S3_BUCKET_NAME, OBJECT_KEYS.LATEST_ROOT);
        const chunks = [];
        
        return new Promise((resolve, reject) => {
            stream.on('data', chunk => chunks.push(chunk));
            stream.on('end', () => {
                try {
                    const data = JSON.parse(Buffer.concat(chunks).toString());
                    resolve(data.rootHash);
                } catch (error) {
                    resolve(null); // No latest root found
                }
            });
            stream.on('error', () => resolve(null)); // Handle object not found
        });

    } catch (error) {
        if (error.code === 'NoSuchKey') {
            return null; // No latest root exists yet
        }
        logger.error('Error getting latest root hash from S3:', error);
        throw error;
    }
}

async function updateLatestRoot(rootMetadata) {
    try {
        await minioClient.putObject(
            config.S3_BUCKET_NAME,
            OBJECT_KEYS.LATEST_ROOT,
            JSON.stringify({
                rootHash: rootMetadata.rootHash,
                createdAt: rootMetadata.createdAt,
                itemCount: rootMetadata.itemCount,
                sourcePath: rootMetadata.sourcePath,
                updatedAt: new Date().toISOString()
            }),
            {
                'Content-Type': 'application/json',
                'x-amz-meta-type': 'latest-root-pointer'
            }
        );
    } catch (error) {
        logger.error('Error updating latest root pointer:', error);
        throw error;
    }
}

async function getTreeByRootHash(rootHash) {
    if (!isConnected) {
        throw new Error('S3 service not connected');
    }

    try {
        // Get metadata first
        const metadataKey = `${OBJECT_KEYS.ROOT_METADATA}${rootHash}.json`;
        const metadataStream = await minioClient.getObject(config.S3_BUCKET_NAME, metadataKey);
        
        const metadataChunks = [];
        const metadata = await new Promise((resolve, reject) => {
            metadataStream.on('data', chunk => metadataChunks.push(chunk));
            metadataStream.on('end', () => {
                try {
                    resolve(JSON.parse(Buffer.concat(metadataChunks).toString()));
                } catch (error) {
                    reject(error);
                }
            });
            metadataStream.on('error', reject);
        });

        // Get tree data
        const treeKey = `${OBJECT_KEYS.TREE_DATA}${rootHash}.json`;
        const treeStream = await minioClient.getObject(config.S3_BUCKET_NAME, treeKey);
        
        const treeChunks = [];
        const treeJson = await new Promise((resolve, reject) => {
            treeStream.on('data', chunk => treeChunks.push(chunk));
            treeStream.on('end', () => {
                try {
                    resolve(JSON.parse(Buffer.concat(treeChunks).toString()));
                } catch (error) {
                    reject(error);
                }
            });
            treeStream.on('error', reject);
        });

        return {
            id: metadata.id,
            rootHash: metadata.rootHash,
            itemCount: metadata.itemCount,
            sourcePath: metadata.sourcePath,
            createdAt: metadata.createdAt,
            treeJson
        };

    } catch (error) {
        if (error.code === 'NoSuchKey') {
            return null;
        }
        logger.error('Error getting tree by root hash from S3:', error);
        throw error;
    }
}

async function getRecentRoots(limit = 10) {
    if (!isConnected) {
        throw new Error('S3 service not connected');
    }

    try {
        const objectsList = [];
        const objectsStream = minioClient.listObjectsV2(config.S3_BUCKET_NAME, OBJECT_KEYS.ROOT_METADATA);

        await new Promise((resolve, reject) => {
            objectsStream.on('data', obj => objectsList.push(obj));
            objectsStream.on('end', resolve);
            objectsStream.on('error', reject);
        });

        // Sort by last modified date (newest first) and take the limit
        const sortedObjects = objectsList
            .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified))
            .slice(0, limit);

        // Fetch metadata for each object
        const recentRoots = await Promise.all(
            sortedObjects.map(async (obj) => {
                try {
                    const stream = await minioClient.getObject(config.S3_BUCKET_NAME, obj.name);
                    const chunks = [];
                    
                    return new Promise((resolve, reject) => {
                        stream.on('data', chunk => chunks.push(chunk));
                        stream.on('end', () => {
                            try {
                                const metadata = JSON.parse(Buffer.concat(chunks).toString());
                                resolve({
                                    id: metadata.id,
                                    root_hash: metadata.rootHash,
                                    item_count: metadata.itemCount,
                                    source_path: metadata.sourcePath,
                                    created_at: metadata.createdAt
                                });
                            } catch (error) {
                                reject(error);
                            }
                        });
                        stream.on('error', reject);
                    });
                } catch (error) {
                    logger.warn(`Failed to fetch metadata for ${obj.name}:`, error);
                    return null;
                }
            })
        );

        return recentRoots.filter(root => root !== null);

    } catch (error) {
        logger.error('Error getting recent roots from S3:', error);
        throw error;
    }
}

async function testConnection() {
    try {
        if (!isConnected) {
            return {
                connected: false,
                error: 'Not initialized'
            };
        }

        // Test by listing bucket
        await minioClient.bucketExists(config.S3_BUCKET_NAME);
        
        return {
            connected: true,
            timestamp: new Date().toISOString(),
            endpoint: config.S3_ENDPOINT,
            bucket: config.S3_BUCKET_NAME
        };
    } catch (error) {
        return {
            connected: false,
            error: error.message
        };
    }
}

async function getStats() {
    if (!isConnected) {
        throw new Error('S3 service not connected');
    }

    try {
        let totalTrees = 0;
        let totalSize = 0;
        let earliestTree = null;
        let latestTree = null;

        const objectsStream = minioClient.listObjectsV2(config.S3_BUCKET_NAME, OBJECT_KEYS.ROOT_METADATA);
        
        await new Promise((resolve, reject) => {
            objectsStream.on('data', obj => {
                totalTrees++;
                totalSize += obj.size;
                
                if (!earliestTree || new Date(obj.lastModified) < new Date(earliestTree)) {
                    earliestTree = obj.lastModified;
                }
                
                if (!latestTree || new Date(obj.lastModified) > new Date(latestTree)) {
                    latestTree = obj.lastModified;
                }
            });
            objectsStream.on('end', resolve);
            objectsStream.on('error', reject);
        });

        return {
            total_trees: totalTrees,
            latest_tree: latestTree,
            earliest_tree: earliestTree,
            total_size_bytes: totalSize,
            avg_item_count: null // Would need to fetch individual metadata to calculate
        };

    } catch (error) {
        logger.error('Error getting S3 stats:', error);
        throw error;
    }
}

function isS3Connected() {
    return isConnected;
}

module.exports = {
    init,
    storeTreeData,
    getLatestRootHash,
    getTreeByRootHash,
    getRecentRoots,
    testConnection,
    getStats,
    isS3Connected,
    OBJECT_KEYS
};
