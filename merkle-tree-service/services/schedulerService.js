const cron = require('node-cron');
const logger = require('../utils/logger');

let treeBuilderService = null;
let config = null;
let cronJob = null;
let isRunning = false;
let isBuildInProgress = false;
let startTime = null;
let buildCount = 0;
let lastBuildAttempt = null;

function init(treeBuilder, appConfig) {
    treeBuilderService = treeBuilder;
    config = appConfig;
}

function start() {
    if (isRunning) {
        logger.warn('Scheduler is already running');
        return;
    }

    try {
        // Create cron expression for the configured interval
        const cronExpression = createCronExpression();
        
        logger.info(`Starting scheduler with interval: ${config.SCAN_INTERVAL_MINUTES} minutes`);
        logger.info(`Cron expression: ${cronExpression}`);

        cronJob = cron.schedule(cronExpression, async () => {
            await executeBuild();
        }, {
            scheduled: false, // Don't start automatically
            timezone: 'UTC'
        });

        cronJob.start();
        isRunning = true;
        startTime = new Date();

        logger.info('Scheduler started successfully');

        // Run initial build immediately
        setImmediate(() => {
            executeBuild();
        });

    } catch (error) {
        logger.error('Failed to start scheduler:', error);
        throw new Error(`Failed to start scheduler: ${error.message}`);
    }
}

function stop() {
    if (!isRunning) {
        logger.warn('Scheduler is not running');
        return;
    }

    try {
        if (cronJob) {
            cronJob.stop();
            cronJob = null;
        }

        isRunning = false;
        logger.info('Scheduler stopped successfully');

        // Wait for current build to complete if in progress
        if (isBuildInProgress) {
            logger.info('Waiting for current build to complete...');
        }

    } catch (error) {
        logger.error('Error stopping scheduler:', error);
        throw new Error(`Failed to stop scheduler: ${error.message}`);
    }
}

async function executeBuild() {
    if (isBuildInProgress) {
        logger.warn('Build already in progress, skipping scheduled execution');
        return;
    }

    isBuildInProgress = true;
    lastBuildAttempt = new Date();
    buildCount++;

    try {
        logger.info(`Executing scheduled build #${buildCount}`);
        
        const result = await treeBuilderService.buildAndSync();
        
        logger.info(`Scheduled build #${buildCount} completed successfully`, {
            rootHash: result.rootHash,
            filesProcessed: result.filesProcessed,
            buildTime: result.buildTime,
            written: result.written
        });

    } catch (error) {
        logger.error(`Scheduled build #${buildCount} failed:`, error);
        // Don't throw here - we want the scheduler to continue running
    } finally {
        isBuildInProgress = false;
    }
}

async function triggerManualBuild() {
    if (isBuildInProgress) {
        throw new Error('Build already in progress');
    }

    logger.info('Manual build triggered');
    return await executeBuild();
}

function createCronExpression() {
    const minutes = config.SCAN_INTERVAL_MINUTES;
    
    if (minutes < 1) {
        throw new Error('Scan interval must be at least 1 minute');
    }

    if (minutes === 1) {
        return '* * * * *'; // Every minute
    } else if (minutes < 60) {
        return `*/${minutes} * * * *`; // Every N minutes
    } else {
        // For intervals >= 60 minutes, convert to hours
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        
        if (remainingMinutes === 0) {
            return `0 */${hours} * * *`; // Every N hours
        } else {
            // For complex intervals, use minute-based scheduling
            return `*/${minutes} * * * *`;
        }
    }
}

function getStatus() {
    return {
        isRunning: isRunning,
        isBuildInProgress: isBuildInProgress,
        startTime: startTime,
        buildCount: buildCount,
        lastBuildAttempt: lastBuildAttempt,
        intervalMinutes: config.SCAN_INTERVAL_MINUTES,
        cronExpression: isRunning ? createCronExpression() : null,
        nextScheduledBuild: getNextScheduledTime()
    };
}

function getNextScheduledTime() {
    if (!isRunning || !lastBuildAttempt) {
        return null;
    }

    const nextBuild = new Date(lastBuildAttempt);
    nextBuild.setMinutes(nextBuild.getMinutes() + config.SCAN_INTERVAL_MINUTES);
    
    return nextBuild;
}

function healthCheck() {
    const status = getStatus();
    const now = new Date();
    
    // Check if scheduler should have run recently
    let healthy = true;
    let issues = [];

    if (!status.isRunning) {
        healthy = false;
        issues.push('Scheduler is not running');
    }

    if (status.lastBuildAttempt) {
        const timeSinceLastBuild = now - status.lastBuildAttempt;
        const expectedInterval = config.SCAN_INTERVAL_MINUTES * 60 * 1000;
        
        // Allow 50% tolerance for scheduling delays
        if (timeSinceLastBuild > expectedInterval * 1.5) {
            healthy = false;
            issues.push(`No build attempt for ${Math.round(timeSinceLastBuild / 1000 / 60)} minutes`);
        }
    }

    return {
        healthy,
        issues,
        status
    };
}

module.exports = {
    init,
    start,
    stop,
    executeBuild,
    triggerManualBuild,
    getStatus,
    healthCheck
};