const { buildMerkleTree } = require('./merkleTree');
const { generateMerkleProof, verifyMerkleProof } = require('./proof');
const { getFilesInDirectory, readDataBlocks, writeOutputFile } = require('./fileUtils');

/**
 * Handle CLI commands
 * @param {object} options - CLI options
 * @returns {Promise<void>}
 */
async function handleCli(options) {
    try {
        let dataBlocks = options.args || [];
        let isFilePaths = false;

        // Handle directory input
        if (options.directory) {
            dataBlocks = await getFilesInDirectory(options.directory);
            isFilePaths = true;
            if (dataBlocks.length === 0) {
                throw new Error(`No files found in directory '${options.directory}'`);
            }
        }

        // Handle file input
        if (options.inputFile) {
            const fileBlocks = await readDataBlocks(options.inputFile);
            dataBlocks = dataBlocks.concat(fileBlocks);
        }

        if (dataBlocks.length === 0) {
            throw new Error('No data blocks or files provided');
        }

        // Build Merkle Tree
        const { root, treeLevels } = await buildMerkleTree(dataBlocks, isFilePaths);
        if (!root) {
            throw new Error('Failed to build Merkle Tree');
        }

        // Output results
        if (options.outputFile) {
            await writeOutputFile(options.outputFile, root, options.pretty);
            console.log(`Merkle Tree saved to ${options.outputFile}`);
        } else {
            console.log('Merkle Tree:');
            console.log(JSON.stringify(root, null, options.pretty ? 2 : null));
        }

        console.log('\nMerkle Root:', root.hash);

        // Handle verification
        if (options.verify) {
            const proof = await generateMerkleProof(
                options.verify, 
                dataBlocks, 
                treeLevels, 
                isFilePaths
            );

            if (!proof) {
                console.log(`Verification failed: '${options.verify}' not found in tree`);
            } else {
                const isValid = await verifyMerkleProof(
                    options.verify, 
                    proof, 
                    root.hash, 
                    isFilePaths
                );
                
                console.log(`\nVerification for '${options.verify}': ${isValid ? 'VALID' : 'INVALID'}`);
                console.log('Merkle Proof:', JSON.stringify(proof, null, options.pretty ? 2 : null));
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

module.exports = {
    handleCli
};