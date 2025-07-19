require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const config = require('./config/app');
const logger = require('./utils/logger');
const redisService = require('./services/redisService');
const schedulerService = require('./services/schedulerService');
const treeBuilderService = require('./services/treeBuilderService');
const storageService = require('./services/storageService');

const app = express();
let dbPool = null;
let server = null;
let isShuttingDown = false;

async function initializeDatabase() {
    if (config.S3_ENABLED) {
        logger.info('S3 storage mode enabled - skipping PostgreSQL initialization');
        await storageService.init(config);
    } else {
        logger.info('PostgreSQL storage mode enabled');
        dbPool = new Pool({
            connectionString: config.DATABASE_URL,
            max: config.PG_POOL_SIZE,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        // Test connection
        try {
            const client = await dbPool.connect();
            await client.query('SELECT NOW()');
            client.release();
            logger.info('Database connection established');
            
            // Initialize storage service with PostgreSQL pool
            await storageService.init(dbPool);
        } catch (error) {
            logger.error('Database connection failed:', error);
            throw error;
        }
    }
}

async function initializeRedis() {
    try {
        await redisService.init(config);
        logger.info('Redis service initialization completed');
    } catch (error) {
        logger.warn('Redis initialization failed, continuing without cache:', error);
        // Don't throw - service should work without Redis
    }
}

function setupMiddleware() {
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    
    // Request logging
    app.use((req, res, next) => {
        logger.info(`${req.method} ${req.path}`);
        next();
    });
}

function setupRoutes() {
    // Initialize services
    treeBuilderService.init(storageService, config);
    schedulerService.init(treeBuilderService, config);

    // Health check route
    app.use('/health', require('./routes/health')(schedulerService, treeBuilderService, storageService, dbPool, redisService));
    
    // Root route
    app.get('/', (req, res) => {
        res.json({
            service: 'Merkle Tree Service',
            version: '1.0.0',
            status: 'running',
            features: {
                caching: config.REDIS_ENABLED ? 'enabled' : 'disabled',
                redis: redisService.isConnected() ? 'connected' : 'disconnected',
                storage: storageService.getStorageMode(),
                s3: config.S3_ENABLED ? 'enabled' : 'disabled'
            },
            endpoints: {
                health: '/health',
                status: '/health/status',
                build: 'POST /health/build',
                cache: '/health/cache'
            }
        });
    });
}

function setupErrorHandling() {
    // 404 handler
    app.use('*', (req, res) => {
        res.status(404).json({
            error: 'Not Found',
            message: `Route ${req.method} ${req.originalUrl} not found`
        });
    });

    // Global error handler
    app.use((error, req, res, next) => {
        logger.error('Express error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: config.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
    });
}

function setupGracefulShutdown() {
    const signals = ['SIGTERM', 'SIGINT'];
    
    signals.forEach(signal => {
        process.on(signal, () => {
            logger.info(`Received ${signal}, starting graceful shutdown...`);
            gracefulShutdown();
        });
    });

    process.on('uncaughtException', (error) => {
        logger.error('Uncaught Exception:', error);
        gracefulShutdown();
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
        gracefulShutdown();
    });
}

async function gracefulShutdown() {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info('Starting graceful shutdown...');

    try {
        // Stop accepting new requests
        if (server) {
            server.close(() => {
                logger.info('HTTP server closed');
            });
        }

        // Stop scheduler
        schedulerService.stop();
        logger.info('Scheduler stopped');

        // Disconnect Redis
        await redisService.disconnect();
        logger.info('Redis disconnected');

        // Close database connections
        if (dbPool) {
            await dbPool.end();
            logger.info('Database connections closed');
        }

        logger.info('Graceful shutdown completed');
        process.exit(0);
    } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
}

async function startServer() {
    try {
        // Setup express middleware
        setupMiddleware();
        
        // Initialize database connection
        await initializeDatabase();
        
        // Initialize Redis
        await initializeRedis();
        
        // Setup routes
        setupRoutes();
        
        // Warm up cache
        if (redisService.isConnected()) {
            await storageService.warmupCache();
        }
        
        // Setup error handling
        setupErrorHandling();
        
        // Start the scheduler
        schedulerService.start();
        logger.info('Scheduler started');
        
        // Start the Express server
        server = app.listen(config.PORT, () => {
            logger.info(`Server running on port ${config.PORT}`);
            logger.info(`Health check: http://localhost:${config.PORT}/health`);
            logger.info(`Cache status: ${redisService.isConnected() ? 'enabled' : 'disabled'}`);
        });

        // Setup graceful shutdown
        setupGracefulShutdown();
        
        logger.info('Server initialized successfully');
        
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
startServer();