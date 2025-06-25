#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { program } from 'commander';
import { buildMerkleTree } from './merkle.js';


program
  .name('merkle-cli')
  .description('Merkle Tree CLI Tool')
  .option('--input-file <path>', 'File with data blocks (one per line)')
  .option('--output-file <path>', 'Save Merkle tree JSON to file')
  .option('--pretty', 'Pretty-print JSON output')
  .argument('[data...]', 'Data blocks to build the tree')
  .parse();

const opts = program.opts();
let dataBlocks = program.args;

if (opts.inputFile) {
  const filePath = path.resolve(opts.inputFile);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found at ${filePath}`);
    process.exit(1);
  }

  const fileData = fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  dataBlocks = [...dataBlocks, ...fileData];
}

if (!dataBlocks.length) {
  console.error('Error: No data blocks provided.');
  process.exit(1);
}

// Build the Merkle Tree
const { root } = buildMerkleTree(dataBlocks);

if (!root) {
  console.error('Error: Merkle Tree could not be built.');
  process.exit(1);
}

// Output JSON
const json = JSON.stringify(root, null, opts.pretty ? 2 : 0);

if (opts.outputFile) {
  fs.writeFileSync(opts.outputFile, json);
  console.log(`Merkle tree saved to ${opts.outputFile}`);
} else {
  console.log('Merkle Tree JSON:');
  console.log(json);
}

console.log(`\nMerkle Root: ${root.hash}`);
