const express = require('express');
const logger = require('../utils/logger');

module.exports = (schedulerService, treeBuilderService, dbSyncService, dbPool) => {
    const router = express.Router();

    router.get('/', async (req, res) => {
        const startTime = Date.now();
        
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            checks: {
                database: { status: 'unknown' },
                scheduler: { status: 'unknown' },
                treeBuilder: { status: 'unknown' },
                fileSystem: { status: 'unknown' }
            },
            lastBuild: null,
            performance: {
                responseTime: 0,
                memory: process.memoryUsage(),
                cpu: process.cpuUsage()
            }
        };

        let overallHealthy = true;

        try {
            // Check database connection
            try {
                const dbResult = await dbSyncService.testConnection();
                health.checks.database = {
                    status: dbResult.connected ? 'healthy' : 'unhealthy',
                    timestamp: dbResult.timestamp,
                    error: dbResult.error
                };
                
                if (!dbResult.connected) {
                    overallHealthy = false;
                }
            } catch (error) {
                health.checks.database = {
                    status: 'unhealthy',
                    error: error.message
                };
                overallHealthy = false;
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

            // Get database stats
            try {
                const dbStats = await dbSyncService.getStats();
                health.database = {
                    totalTrees: parseInt(dbStats.total_trees) || 0,
                    latestTree: dbStats.latest_tree,
                    earliestTree: dbStats.earliest_tree,
                    avgItemCount: parseFloat(dbStats.avg_item_count) || 0
                };
            } catch (error) {
                logger.warn('Failed to get database stats:', error);
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
                scheduler: schedulerService.getStatus(),
                treeBuilder: treeBuilderService.getStatus(),
                database: await dbSyncService.getStats(),
                recentRoots: await dbSyncService.getRecentRoots(5)
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