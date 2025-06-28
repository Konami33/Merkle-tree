module.exports = {
    ...require('./lib/hashing'),
    ...require('./lib/fileUtils'),
    ...require('./lib/merkleTree'),
    ...require('./lib/proof'),
    ...require('./lib/cliHandler')
};