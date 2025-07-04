require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const config = require('./config/app');
const logger = require('./utils/logger');
const schedulerService = require('./services/schedulerService');
const treeBuilderService = require('./services/treeBuilderService');
const dbSyncService = require('./services/dbSyncService');

const app = express();
let dbPool = null;
let server = null;
let isShuttingDown = false;

async function initializeDatabase() {
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
    } catch (error) {
        logger.error('Database connection failed:', error);
        throw error;
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
    dbSyncService.init(dbPool);
    treeBuilderService.init(dbSyncService, config);
    schedulerService.init(treeBuilderService, config);

    // Health check route
    app.use('/health', require('./routes/health')(schedulerService, treeBuilderService, dbSyncService, dbPool));
    
    // Root route
    app.get('/', (req, res) => {
        res.json({
            service: 'Merkle Tree Service',
            version: '1.0.0',
            status: 'running',
            endpoints: {
                health: '/health',
                status: '/health/status',
                build: 'POST /health/build'
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
        
        // Setup routes
        setupRoutes();
        
        // Setup error handling
        setupErrorHandling();
        
        // Start the scheduler
        schedulerService.start();
        logger.info('Scheduler started');
        
        // Start the Express server
        server = app.listen(config.PORT, () => {
            logger.info(`Server running on port ${config.PORT}`);
            logger.info(`Health check: http://localhost:${config.PORT}/health`);
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