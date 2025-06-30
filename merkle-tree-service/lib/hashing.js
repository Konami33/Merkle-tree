const crypto = require('crypto');
const fs = require('fs');
const { promisify } = require('util');

const read = promisify(fs.read);

/**
 * Hash data using SHA-256
 * @param {string} data - Input data to hash
 * @returns {string} Hexadecimal hash string
 */
function hashData(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Hash file contents using SHA-256
 * @param {string} filePath - Path to file
 * @returns {Promise<string>} Hexadecimal hash string
 */
async function hashFile(filePath) {
    const fd = await fs.promises.open(filePath, 'r');
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.alloc(4096);
    
    try {
        let bytesRead;
        do {
            ({ bytesRead } = await read(fd.fd, buffer, 0, 4096, null));
            if (bytesRead > 0) {
                hash.update(buffer.slice(0, bytesRead));
            }
        } while (bytesRead > 0);
        
        return hash.digest('hex');
    } finally {
        await fd.close();
    }
}

module.exports = {
    hashData,
    hashFile
};