const { hashData, hashFile } = require('./hashing');

/**
 * Generate Merkle proof for an item
 * @param {string} target - Target item to prove
 * @param {string[]} items - Original items
 * @param {array[]} treeLevels - Merkle tree levels
 * @param {boolean} [isFilePaths=false] - Whether items are file paths
 * @returns {Promise<object[]>} Merkle proof path
 */
async function generateMerkleProof(target, items, treeLevels, isFilePaths = false) {
    if (!items || items.length === 0) {
        return null;
    }
    
    const targetHash = isFilePaths ? await hashFile(target) : hashData(target);
    const index = items.findIndex(item => 
        (isFilePaths ? hashFile(item) : hashData(item)) === targetHash
    );
    
    if (index === -1) return null;
    
    const proof = [];
    let currentIndex = index;
    
    for (let level = 0; level < treeLevels.length - 1; level++) {
        const currentLevel = treeLevels[level];
        const isRightNode = currentIndex % 2;
        const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;
        
        if (siblingIndex < currentLevel.length) {
            proof.push({
                hash: currentLevel[siblingIndex].hash,
                position: isRightNode ? 'left' : 'right'
            });
        } else {
            // Handle odd node case
            proof.push({
                hash: currentLevel[currentIndex].hash,
                position: isRightNode ? 'left' : 'right'
            });
        }
        
        currentIndex = Math.floor(currentIndex / 2);
    }
    
    return proof;
}

/**
 * Verify Merkle proof
 * @param {string} target - Target item to verify
 * @param {object[]} proof - Merkle proof path
 * @param {string} merkleRoot - Expected root hash
 * @param {boolean} [isFilePath=false] - Whether target is a file path
 * @returns {Promise<boolean>} True if valid
 */
async function verifyMerkleProof(target, proof, merkleRoot, isFilePath = false) {
    let currentHash = isFilePath ? await hashFile(target) : hashData(target);
    
    for (const step of proof) {
        const { hash, position } = step;
        currentHash = position === 'left' 
            ? hashData(hash + currentHash)
            : hashData(currentHash + hash);
    }
    
    return currentHash === merkleRoot;
}

module.exports = {
    generateMerkleProof,
    verifyMerkleProof
};