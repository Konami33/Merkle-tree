const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

/**
 * Recursively get all files in a directory
 * @param {string} dir - Directory path
 * @returns {Promise<string[]>} Array of file paths
 */
async function getFilesInDirectory(dir) {
    try {
        const entries = await readdir(dir);
        let files = [];
        
        for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            const stats = await stat(fullPath);
            
            if (stats.isDirectory()) {
                files = files.concat(await getFilesInDirectory(fullPath));
            } else {
                files.push(fullPath);
            }
        }
        
        return files.sort(); // Consistent ordering
    } catch (error) {
        throw new Error(`Failed to read directory ${dir}: ${error.message}`);
    }
}

/**
 * Check if directory exists and is accessible
 * @param {string} dir - Directory path
 * @returns {Promise<boolean>} True if accessible
 */
async function isDirectoryAccessible(dir) {
    try {
        const stats = await stat(dir);
        return stats.isDirectory();
    } catch (error) {
        return false;
    }
}

/**
 * Get file stats
 * @param {string} filePath - File path
 * @returns {Promise<object>} File stats
 */
async function getFileStats(filePath) {
    try {
        return await stat(filePath);
    } catch (error) {
        throw new Error(`Failed to get stats for ${filePath}: ${error.message}`);
    }
}

module.exports = {
    getFilesInDirectory,
    isDirectoryAccessible,
    getFileStats
};