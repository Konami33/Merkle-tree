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
}

/**
 * Read data blocks from file
 * @param {string} filePath - Input file path
 * @returns {Promise<string[]>} Array of data blocks
 */
async function readDataBlocks(filePath) {
    try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        return content.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
    } catch (error) {
        throw new Error(`File read error: ${error.message}`);
    }
}

/**
 * Write data to file
 * @param {string} filePath - Output file path
 * @param {object} data - Data to write
 * @param {boolean} [pretty=false] - Pretty-print JSON
 * @returns {Promise<void>}
 */
async function writeOutputFile(filePath, data, pretty = false) {
    try {
        const json = JSON.stringify(data, null, pretty ? 2 : null);
        await fs.promises.writeFile(filePath, json);
    } catch (error) {
        throw new Error(`File write error: ${error.message}`);
    }
}

module.exports = {
    getFilesInDirectory,
    readDataBlocks,
    writeOutputFile
};