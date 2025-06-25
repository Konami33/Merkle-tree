import argparse
import hashlib
import json
import os

def hash_data(data):
    """Compute SHA-256 hash of a data block."""
    return hashlib.sha256(data.encode('utf-8')).hexdigest()

def build_merkle_tree(data_blocks):
    """Build a Merkle Tree and return the root and full tree structure."""
    if not data_blocks:
        return None, None

    # Create leaf nodes
    nodes = [{"hash": hash_data(block), "data": block} for block in data_blocks]
    
    # Store all levels for verification
    tree_levels = [nodes]
    
    # Build the tree iteratively
    while len(nodes) > 1:
        next_level = []
        for i in range(0, len(nodes), 2):
            if i + 1 < len(nodes):
                left = nodes[i]
                right = nodes[i + 1]
                combined = left["hash"] + right["hash"]
                parent_hash = hashlib.sha256(combined.encode('utf-8')).hexdigest()
                parent = {"hash": parent_hash, "left": left, "right": right}
            else:
                left = nodes[i]
                right = nodes[i]  # Duplicate last node
                combined = left["hash"] + right["hash"]
                parent_hash = hashlib.sha256(combined.encode('utf-8')).hexdigest()
                parent = {"hash": parent_hash, "left": left, "right": right}
            next_level.append(parent)
        nodes = next_level
        tree_levels.append(nodes)
    
    return nodes[0], tree_levels

def main():
    parser = argparse.ArgumentParser(description="Merkle Tree CLI Tool")
    parser.add_argument("data", nargs="*", help="Data blocks to build the Merkle Tree")
    parser.add_argument("--input-file", help="File containing data blocks (one per line)")
    parser.add_argument("--output-file", help="File to save the Merkle Tree JSON")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output")
    
    args = parser.parse_args()

    # Read data blocks
    data_blocks = args.data
    if args.input_file:
        if not os.path.exists(args.input_file):
            print(f"Error: Input file '{args.input_file}' not found.")
            return
        with open(args.input_file, 'r') as f:
            data_blocks.extend(line.strip() for line in f if line.strip())

    if not data_blocks:
        print("Error: No data blocks provided.")
        return

    # Build Merkle Tree
    root_node, tree_levels = build_merkle_tree(data_blocks)
    if not root_node:
        print("Error: Failed to build Merkle Tree.")
        return

    # Prepare JSON output
    indent = 2 if args.pretty else None
    json_output = json.dumps(root_node, indent=indent)

    # Print or save JSON
    if args.output_file:
        with open(args.output_file, 'w') as f:
            f.write(json_output)
        print(f"Merkle Tree saved to {args.output_file}")
    else:
        print("Merkle Tree JSON:")
        print(json_output)

    # Print Merkle Root
    print("\nMerkle Root:", root_node["hash"])

if __name__ == "__main__":
    main()