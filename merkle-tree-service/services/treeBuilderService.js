const path = require('path');
const logger = require('../utils/logger');
const { getFilesInDirectory, isDirectoryAccessible } = require('../lib/fileUtils');
const { buildMerkleTree } = require('../lib/merkleTree');

let dbSyncService = null;
let config = null;
let lastBuildTime = null;
let lastBuildResult = null;

function init(dbSync, appConfig) {
    dbSyncService = dbSync;
    config = appConfig;
}

async function buildAndSync() {
    const startTime = Date.now();
    logger.info('Starting Merkle tree build process');

    try {
        // Validate source directory
        await validateSourceDirectory();

        // Scan directory for files
        const files = await scanDirectory();
        
        if (files.length === 0) {
            throw new Error(`No files found in source directory: ${config.SOURCE_DIRECTORY}`);
        }

        logger.info(`Found ${files.length} files to process`);

        // Build Merkle tree
        const treeData = await buildTree(files);
        
        // Add metadata
        treeData.sourcePath = config.SOURCE_DIRECTORY;
        treeData.buildTime = Date.now() - startTime;

        // Sync to database
        const syncResult = await dbSyncService.syncTree(treeData);

        const buildResult = {
            success: true,
            timestamp: new Date().toISOString(),
            buildTime: treeData.buildTime,
            rootHash: treeData.root.hash,
            leafCount: treeData.leafCount,
            filesProcessed: files.length,
            written: syncResult.written,
            syncResult
        };

        lastBuildTime = new Date();
        lastBuildResult = buildResult;

        logger.info('Build process completed successfully', {
            buildTime: buildResult.buildTime,
            rootHash: buildResult.rootHash,
            filesProcessed: buildResult.filesProcessed,
            written: buildResult.written
        });

        return buildResult;

    } catch (error) {
        const buildResult = {
            success: false,
            timestamp: new Date().toISOString(),
            buildTime: Date.now() - startTime,
            error: error.message,
            errorType: error.constructor.name
        };

        lastBuildTime = new Date();
        lastBuildResult = buildResult;

        logger.error('Build process failed:', error);
        throw error;
    }
}

async function validateSourceDirectory() {
    const isAccessible = await isDirectoryAccessible(config.SOURCE_DIRECTORY);
    
    if (!isAccessible) {
        throw new Error(`Source directory is not accessible: ${config.SOURCE_DIRECTORY}`);
    }
}

async function scanDirectory() {
    try {
        logger.debug(`Scanning directory: ${config.SOURCE_DIRECTORY}`);
        
        const files = await getFilesInDirectory(config.SOURCE_DIRECTORY);
        
        // Apply batch size limit if configured
        if (config.BATCH_SIZE && files.length > config.BATCH_SIZE) {
            logger.warn(`Found ${files.length} files, limiting to batch size of ${config.BATCH_SIZE}`);
            return files.slice(0, config.BATCH_SIZE);
        }

        return files;

    } catch (error) {
        throw new Error(`Failed to scan directory: ${error.message}`);
    }
}

async function buildTree(files) {
    try {
        logger.debug(`Building Merkle tree from ${files.length} files`);
        
        const result = await buildMerkleTree(files, true); // true indicates file paths
        
        if (!result.root) {
            throw new Error('Failed to build Merkle tree: no root generated');
        }

        logger.debug(`Merkle tree built successfully with root hash: ${result.root.hash}`);
        
        return result;

    } catch (error) {
        throw new Error(`Failed to build Merkle tree: ${error.message}`);
    }
}

// Manual trigger for testing/debugging
async function triggerBuild() {
    logger.info('Manual build triggered');
    return await buildAndSync();
}

// Get build status
function getStatus() {
    return {
        lastBuildTime: lastBuildTime,
        lastBuildResult: lastBuildResult,
        sourceDirectory: config.SOURCE_DIRECTORY,
        batchSize: config.BATCH_SIZE
    };
}

// Health check
async function healthCheck() {
    try {
        // Check if source directory is accessible
        await validateSourceDirectory();
        
        // Check if we can scan the directory
        const files = await scanDirectory();
        
        return {
            healthy: true,
            sourceDirectory: config.SOURCE_DIRECTORY,
            filesFound: files.length,
            lastBuildTime: lastBuildTime,
            lastBuildSuccess: lastBuildResult?.success
        };

    } catch (error) {
        return {
            healthy: false,
            error: error.message,
            sourceDirectory: config.SOURCE_DIRECTORY
        };
    }
}

module.exports = {
    init,
    buildAndSync,
    triggerBuild,
    getStatus,
    healthCheck
};