#!/usr/bin/env node
const { program } = require('commander');
const { version } = require('../package.json');
const { handleCli } = require('../lib/cliHandler');

program
    .name('merkle-tree')
    .description('CLI tool for building and verifying Merkle Trees')
    .version(version)
    .argument('[data...]', 'data blocks to include in the Merkle Tree')
    .option('-i, --input-file <file>', 'input file containing data blocks (one per line)')
    .option('-d, --directory <dir>', 'directory to build Merkle Tree from file contents')
    .option('-o, --output-file <file>', 'output file to save the Merkle Tree JSON')
    .option('-p, --pretty', 'pretty-print JSON output')
    .option('-v, --verify <data>', 'verify if a data block or file is in the tree')
    .action((args, options) => {
        handleCli({
            args,
            ...options.opts()
        });
    });

program.parse(process.argv);