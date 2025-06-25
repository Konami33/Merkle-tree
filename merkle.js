import { hashData } from './utils.js';

export function buildMerkleTree(dataBlocks) {
  if (!dataBlocks.length) return { root: null, levels: [] };

  let nodes = dataBlocks.map(block => ({
    hash: hashData(block),
    data: block
  }));

  const levels = [nodes];

  while (nodes.length > 1) {
    const nextLevel = [];

    for (let i = 0; i < nodes.length; i += 2) {
      const left = nodes[i];
      const right = nodes[i + 1] || nodes[i]; // duplicate last if odd
      const combinedHash = hashData(left.hash + right.hash);
      nextLevel.push({ hash: combinedHash, left, right });
    }

    nodes = nextLevel;
    levels.push(nodes);
  }

  return { root: nodes[0], levels };
}
