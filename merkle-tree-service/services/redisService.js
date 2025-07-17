const redis = require('redis');
const logger = require('../utils/logger');

let redisClient = null;
let config = null;
let isConnected = false;

// Cache keys
const CACHE_KEYS = {
    LATEST_ROOT_HASH: 'merkle:latest_root_hash',
    TREE_METADATA: 'merkle:tree_metadata:',
    BUILD_STATUS: 'merkle:build_status',
    HEALTH_CHECK: 'merkle:health_check'
};

async function init(appConfig) {
    config = appConfig;
    
    if (!config.REDIS_ENABLED) {
        logger.info('Redis caching is disabled');
        return;
    }

    try {
        // Create Redis client
        const clientConfig = {
            socket: {
                host: config.REDIS_HOST,
                port: config.REDIS_PORT,
                reconnectStrategy: (retries) => {
                    if (retries > 10) {
                        logger.error('Redis connection failed after 10 retries');
                        return new Error('Redis connection failed');
                    }
                    return Math.min(retries * 100, 3000);
                }
            },
            database: config.REDIS_DB
        };

        if (config.REDIS_PASSWORD) {
            clientConfig.password = config.REDIS_PASSWORD;
        }

        redisClient = redis.createClient(clientConfig);

        // Event handlers
        redisClient.on('connect', () => {
            logger.info('Redis client connecting...');
        });

        redisClient.on('ready', () => {
            logger.info('Redis client ready');
            isConnected = true;
        });

        redisClient.on('error', (error) => {
            logger.error('Redis client error:', error);
            isConnected = false;
        });

        redisClient.on('end', () => {
            logger.warn('Redis client connection ended');
            isConnected = false;
        });

        redisClient.on('reconnecting', () => {
            logger.info('Redis client reconnecting...');
        });

        // Connect to Redis
        await redisClient.connect();
        
        logger.info('Redis service initialized successfully');
        
    } catch (error) {
        logger.error('Failed to initialize Redis service:', error);
        isConnected = false;
        // Don't throw error - service should work without Redis
    }
}

async function disconnect() {
    if (redisClient && isConnected) {
        try {
            await redisClient.disconnect();
            logger.info('Redis client disconnected');
        } catch (error) {
            logger.error('Error disconnecting Redis client:', error);
        }
    }
    isConnected = false;
}

// Generic cache operations
async function get(key) {
    if (!isConnected || !redisClient) {
        logger.debug('Redis not available for GET operation');
        return null;
    }

    try {
        const value = await redisClient.get(key);
        if (value) {
            logger.debug(`Cache HIT for key: ${key}`);
            return JSON.parse(value);
        }
        logger.debug(`Cache MISS for key: ${key}`);
        return null;
    } catch (error) {
        logger.error(`Redis GET error for key ${key}:`, error);
        return null;
    }
}

async function set(key, value, ttl = null) {
    if (!isConnected || !redisClient) {
        logger.debug('Redis not available for SET operation');
        return false;
    }

    try {
        const serializedValue = JSON.stringify(value);
        const actualTtl = ttl || config.REDIS_TTL;
        
        await redisClient.setEx(key, actualTtl, serializedValue);
        logger.debug(`Cache SET for key: ${key} (TTL: ${actualTtl}s)`);
        return true;
    } catch (error) {
        logger.error(`Redis SET error for key ${key}:`, error);
        return false;
    }
}

async function del(key) {
    if (!isConnected || !redisClient) {
        logger.debug('Redis not available for DELETE operation');
        return false;
    }

    try {
        await redisClient.del(key);
        logger.debug(`Cache DELETE for key: ${key}`);
        return true;
    } catch (error) {
        logger.error(`Redis DELETE error for key ${key}:`, error);
        return false;
    }
}

async function exists(key) {
    if (!isConnected || !redisClient) {
        return false;
    }

    try {
        const result = await redisClient.exists(key);
        return result === 1;
    } catch (error) {
        logger.error(`Redis EXISTS error for key ${key}:`, error);
        return false;
    }
}

// Merkle tree specific cache operations
async function getLatestRootHash() {
    return await get(CACHE_KEYS.LATEST_ROOT_HASH);
}

async function setLatestRootHash(rootHash, metadata = {}) {
    const cacheData = {
        rootHash,
        timestamp: new Date().toISOString(),
        ...metadata
    };
    
    return await set(CACHE_KEYS.LATEST_ROOT_HASH, cacheData);
}

async function getTreeMetadata(rootHash) {
    const key = CACHE_KEYS.TREE_METADATA + rootHash;
    return await get(key);
}

async function setTreeMetadata(rootHash, metadata) {
    const key = CACHE_KEYS.TREE_METADATA + rootHash;
    const cacheData = {
        ...metadata,
        cachedAt: new Date().toISOString()
    };
    
    return await set(key, cacheData, config.REDIS_TTL * 2); // Longer TTL for metadata
}

async function setBuildStatus(status) {
    return await set(CACHE_KEYS.BUILD_STATUS, status, 300); // 5 minutes TTL
}

async function getBuildStatus() {
    return await get(CACHE_KEYS.BUILD_STATUS);
}

async function invalidateCache(pattern = null) {
    if (!isConnected || !redisClient) {
        return false;
    }

    try {
        if (pattern) {
            // Delete keys matching pattern
            const keys = await redisClient.keys(pattern);
            if (keys.length > 0) {
                await redisClient.del(keys);
                logger.info(`Invalidated ${keys.length} cache keys matching pattern: ${pattern}`);
            }
        } else {
            // Clear all merkle-related cache
            const keys = await redisClient.keys('merkle:*');
            if (keys.length > 0) {
                await redisClient.del(keys);
                logger.info(`Invalidated all ${keys.length} merkle cache keys`);
            }
        }
        return true;
    } catch (error) {
        logger.error('Cache invalidation error:', error);
        return false;
    }
}

async function getHealthStatus() {
    const health = {
        connected: isConnected,
        timestamp: new Date().toISOString()
    };

    if (isConnected) {
        try {
            // Test Redis connectivity with a ping
            const pingResult = await redisClient.ping();
            health.ping = pingResult;
            health.status = 'healthy';
        } catch (error) {
            health.status = 'unhealthy';
            health.error = error.message;
        }
    } else {
        health.status = 'disconnected';
    }

    return health;
}

// Cache statistics
async function getCacheStats() {
    if (!isConnected || !redisClient) {
        return { available: false };
    }

    try {
        const info = await redisClient.info('memory');
        const keyspace = await redisClient.info('keyspace');
        const merkleKeys = await redisClient.keys('merkle:*');
        
        return {
            available: true,
            connected: isConnected,
            memory: info,
            keyspace: keyspace,
            merkleKeys: merkleKeys.length,
            keys: merkleKeys
        };
    } catch (error) {
        logger.error('Error getting cache stats:', error);
        return { available: false, error: error.message };
    }
}

module.exports = {
    init,
    disconnect,
    get,
    set,
    del,
    exists,
    getLatestRootHash,
    setLatestRootHash,
    getTreeMetadata,
    setTreeMetadata,
    setBuildStatus,
    getBuildStatus,
    invalidateCache,
    getHealthStatus,
    getCacheStats,
    isConnected: () => isConnected,
    CACHE_KEYS
};
