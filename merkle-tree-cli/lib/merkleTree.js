const { hashData, hashFile } = require('./hashing');

/**
 * Build a Merkle Tree from data blocks or files
 * @param {string[]} items - Array of data blocks or file paths
 * @param {boolean} [isFilePaths=false] - Whether items are file paths
 * @returns {Promise<{root: object, treeLevels: array[]}>}
 */
async function buildMerkleTree(items, isFilePaths = false) {
    if (!items || items.length === 0) {
        return { root: null, treeLevels: null };
    }

    // Create leaf nodes
    const nodes = [];
    for (const item of items) {
        const hash = isFilePaths ? await hashFile(item) : hashData(item);
        nodes.push({
            hash,
            [isFilePaths ? 'filePath' : 'data']: item
        });
    }

    const treeLevels = [nodes];
    let currentLevel = nodes;

    while (currentLevel.length > 1) {
        const nextLevel = [];
        
        for (let i = 0; i < currentLevel.length; i += 2) {
            const left = currentLevel[i];
            const right = (i + 1 < currentLevel.length) ? currentLevel[i + 1] : currentLevel[i];
            const combinedHash = hashData(left.hash + right.hash);
            
            nextLevel.push({
                hash: combinedHash,
                left,
                right
            });
        }
        
        treeLevels.push(nextLevel);
        currentLevel = nextLevel;
    }
    
    return { 
        root: currentLevel[0], 
        treeLevels,
        leafCount: items.length
    };
}

module.exports = {
    buildMerkleTree
};