const path = require('path');

const config = {
    // Server configuration
    PORT: parseInt(process.env.PORT) || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    
    // Merkle Tree configuration
    SCAN_INTERVAL_MINUTES: parseInt(process.env.SCAN_INTERVAL_MINUTES) || 5,
    SOURCE_DIRECTORY: process.env.SOURCE_DIRECTORY || path.join(__dirname, '../data'),
    BATCH_SIZE: parseInt(process.env.BATCH_SIZE) || 100,
    
    // Database configuration (PostgreSQL) - Legacy support
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/merkle_db',
    PG_POOL_SIZE: parseInt(process.env.PG_POOL_SIZE) || 5,
    DB_RETRY_ATTEMPTS: parseInt(process.env.DB_RETRY_ATTEMPTS) || 3,
    DB_RETRY_DELAY: parseInt(process.env.DB_RETRY_DELAY) || 1000,
    
    // MinIO/S3 Configuration
    S3_ENABLED: process.env.S3_ENABLED !== 'false', // Enable by default
    S3_ENDPOINT: process.env.S3_ENDPOINT || 'localhost',
    S3_PORT: parseInt(process.env.S3_PORT) || 9000,
    S3_USE_SSL: process.env.S3_USE_SSL === 'true',
    S3_ACCESS_KEY: process.env.S3_ACCESS_KEY || 'minioadmin',
    S3_SECRET_KEY: process.env.S3_SECRET_KEY || 'minioadmin',
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME || 'merkle-trees',
    S3_REGION: process.env.S3_REGION || 'us-east-1',
    
    // Redis configuration
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
    REDIS_HOST: process.env.REDIS_HOST || 'localhost',
    REDIS_PORT: parseInt(process.env.REDIS_PORT) || 6379,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
    REDIS_DB: parseInt(process.env.REDIS_DB) || 0,
    REDIS_TTL: parseInt(process.env.REDIS_TTL) || 3600, // 1 hour default
    REDIS_ENABLED: process.env.REDIS_ENABLED !== 'false', // Enable by default
    
    // Logging configuration
    LOG_LEVEL: process.env.LOG_LEVEL || 'info'
};

// Validation
if (!config.SOURCE_DIRECTORY) {
    throw new Error('SOURCE_DIRECTORY environment variable is required');
}

if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
}

module.exports = config;