const express = require('express');
const logger = require('../utils/logger');

module.exports = (schedulerService, treeBuilderService, storageService, dbPool, redisService) => {
    const router = express.Router();

    router.get('/', async (req, res) => {
        const startTime = Date.now();
        
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            checks: {
                storage: { status: 'unknown' },
                redis: { status: 'unknown' },
                scheduler: { status: 'unknown' },
                treeBuilder: { status: 'unknown' },
                fileSystem: { status: 'unknown' }
            },
            lastBuild: null,
            storageMode: storageService.getStorageMode(),
            performance: {
                responseTime: 0,
                memory: process.memoryUsage(),
                cpu: process.cpuUsage()
            }
        };

        let overallHealthy = true;

        try {
            // Check storage connection (S3 or PostgreSQL)
            try {
                const storageResult = await storageService.testConnection();
                health.checks.storage = {
                    status: storageResult.connected ? 'healthy' : 'unhealthy',
                    timestamp: storageResult.timestamp,
                    storageMode: storageResult.storageMode,
                    endpoint: storageResult.endpoint,
                    bucket: storageResult.bucket,
                    error: storageResult.error
                };
                
                if (!storageResult.connected) {
                    overallHealthy = false;
                }
            } catch (error) {
                health.checks.storage = {
                    status: 'unhealthy',
                    error: error.message
                };
                overallHealthy = false;
            }

            // Check Redis connection
            try {
                const redisHealth = await redisService.getHealthStatus();
                health.checks.redis = redisHealth;
                
                // Redis is optional, so don't fail overall health if Redis is down
                // but log a warning
                if (redisHealth.status !== 'healthy') {
                    logger.warn('Redis health check failed:', redisHealth);
                }
            } catch (error) {
                health.checks.redis = {
                    status: 'unhealthy',
                    error: error.message
                };
                logger.warn('Redis health check error:', error);
            }

            // Check scheduler status
            try {
                const schedulerHealth = schedulerService.healthCheck();
                health.checks.scheduler = {
                    status: schedulerHealth.healthy ? 'healthy' : 'unhealthy',
                    ...schedulerHealth.status,
                    issues: schedulerHealth.issues
                };
                
                if (!schedulerHealth.healthy) {
                    overallHealthy = false;
                }
            } catch (error) {
                health.checks.scheduler = {
                    status: 'unhealthy',
                    error: error.message
                };
                overallHealthy = false;
            }

            // Check tree builder status
            try {
                const builderHealth = await treeBuilderService.healthCheck();
                health.checks.treeBuilder = builderHealth;
                health.checks.fileSystem = {
                    status: builderHealth.healthy ? 'healthy' : 'unhealthy',
                    sourceDirectory: builderHealth.sourceDirectory,
                    filesFound: builderHealth.filesFound
                };
                
                if (!builderHealth.healthy) {
                    overallHealthy = false;
                }
            } catch (error) {
                health.checks.treeBuilder = {
                    status: 'unhealthy',
                    error: error.message
                };
                health.checks.fileSystem = {
                    status: 'unhealthy',
                    error: error.message
                };
                overallHealthy = false;
            }

            // Get last build information
            try {
                const builderStatus = treeBuilderService.getStatus();
                if (builderStatus.lastBuildResult) {
                    health.lastBuild = {
                        timestamp: builderStatus.lastBuildTime,
                        success: builderStatus.lastBuildResult.success,
                        rootHash: builderStatus.lastBuildResult.rootHash,
                        filesProcessed: builderStatus.lastBuildResult.filesProcessed,
                        buildTime: builderStatus.lastBuildResult.buildTime,
                        written: builderStatus.lastBuildResult.written
                    };
                }
            } catch (error) {
                logger.warn('Failed to get last build info:', error);
            }

            // Get storage stats
            try {
                const storageStats = await storageService.getStats();
                health.storage = {
                    totalTrees: parseInt(storageStats.total_trees) || 0,
                    latestTree: storageStats.latest_tree,
                    earliestTree: storageStats.earliest_tree,
                    avgItemCount: parseFloat(storageStats.avg_item_count) || 0,
                    storageMode: storageStats.storageMode,
                    totalSizeBytes: storageStats.total_size_bytes
                };
            } catch (error) {
                logger.warn('Failed to get storage stats:', error);
            }

        } catch (error) {
            logger.error('Health check failed:', error);
            overallHealthy = false;
            health.error = error.message;
        }

        // Calculate response time
        health.performance.responseTime = Date.now() - startTime;
        
        // Set overall status
        health.status = overallHealthy ? 'healthy' : 'unhealthy';

        // Return appropriate HTTP status code
        const statusCode = overallHealthy ? 200 : 503;
        
        res.status(statusCode).json(health);
    });

    // Detailed status endpoint
    router.get('/status', async (req, res) => {
        try {
            const status = {
                service: 'Merkle Tree Service',
                version: '1.0.0',
                timestamp: new Date().toISOString(),
                storageMode: storageService.getStorageMode(),
                scheduler: schedulerService.getStatus(),
                treeBuilder: treeBuilderService.getStatus(),
                storage: await storageService.getStats(),
                cache: await redisService.getCacheStats(),
                recentRoots: await storageService.getRecentRoots(5)
            };

            res.json(status);
        } catch (error) {
            logger.error('Status endpoint failed:', error);
            res.status(500).json({
                error: 'Failed to get status',
                message: error.message
            });
        }
    });

    // Cache management endpoints
    router.get('/cache', async (req, res) => {
        try {
            const cacheStats = await redisService.getCacheStats();
            const cacheHealth = await redisService.getHealthStatus();
            
            res.json({
                health: cacheHealth,
                stats: cacheStats,
                enabled: redisService.isConnected()
            });
        } catch (error) {
            logger.error('Cache status endpoint failed:', error);
            res.status(500).json({
                error: 'Failed to get cache status',
                message: error.message
            });
        }
    });

    router.post('/cache/clear', async (req, res) => {
        try {
            const cleared = await storageService.clearCache();
            
            res.json({
                success: cleared,
                message: cleared ? 'Cache cleared successfully' : 'Failed to clear cache',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Cache clear failed:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                message: 'Failed to clear cache'
            });
        }
    });

    router.post('/cache/warmup', async (req, res) => {
        try {
            const warmed = await storageService.warmupCache();
            
            res.json({
                success: warmed,
                message: warmed ? 'Cache warmed up successfully' : 'Failed to warm up cache',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Cache warmup failed:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                message: 'Failed to warm up cache'
            });
        }
    });

    // Manual build trigger endpoint
    router.post('/build', async (req, res) => {
        try {
            logger.info('Manual build triggered via API');
            
            const result = await schedulerService.triggerManualBuild();
            
            res.json({
                success: true,
                message: 'Build completed successfully',
                result
            });
        } catch (error) {
            logger.error('Manual build failed:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                message: 'Build failed'
            });
        }
    });

    return router;
};