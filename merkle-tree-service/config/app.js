const path = require('path');

const config = {
    // Server configuration
    PORT: parseInt(process.env.PORT) || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    
    // Merkle Tree configuration
    SCAN_INTERVAL_MINUTES: parseInt(process.env.SCAN_INTERVAL_MINUTES) || 5,
    SOURCE_DIRECTORY: process.env.SOURCE_DIRECTORY || path.join(__dirname, '../data'),
    BATCH_SIZE: parseInt(process.env.BATCH_SIZE) || 100,
    
    // Database configuration
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/merkle_db',
    PG_POOL_SIZE: parseInt(process.env.PG_POOL_SIZE) || 5,
    DB_RETRY_ATTEMPTS: parseInt(process.env.DB_RETRY_ATTEMPTS) || 3,
    DB_RETRY_DELAY: parseInt(process.env.DB_RETRY_DELAY) || 1000,
    
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