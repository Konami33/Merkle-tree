import argparse
import hashlib
import json
import os

def hash_data(data):
    """Compute SHA-256 hash of a data block."""
    return hashlib.sha256(data.encode('utf-8')).hexdigest()

def hash_file(file_path):
    """Compute SHA-256 hash of a file's contents."""
    sha256 = hashlib.sha256()
    with open(file_path, 'rb') as f:
        # Read file in chunks to handle large files efficiently
        for chunk in iter(lambda: f.read(4096), b''):
            sha256.update(chunk)
    return sha256.hexdigest()

def get_files_in_directory(directory):
    """Recursively collect all file paths in a directory."""
    file_paths = []
    for root, _, files in os.walk(directory):
        for file in files:
            file_paths.append(os.path.join(root, file))
    return sorted(file_paths)  # Sort for consistent ordering

def build_merkle_tree(data_blocks, is_file_paths=False):
    """Build a Merkle Tree and return the root and full tree structure."""
    if not data_blocks:
        return None, None

    # Create leaf nodes
    if is_file_paths:
        nodes = [{"hash": hash_file(block), "file_path": block} for block in data_blocks]
    else:
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

def generate_merkle_proof(target, data_blocks, tree_levels, is_file_paths=False):
    """Generate a Merkle Proof for a data block or file."""
    if not data_blocks:
        return None
    
    # Find index of the target
    target_hash = hash_file(target) if is_file_paths else hash_data(target)
    index = next((i for i, block in enumerate(data_blocks) if (hash_file(block) if is_file_paths else hash_data(block)) == target_hash), None)
    if index is None:
        return None
    
    proof = []
    current_index = index
    for level in tree_levels[:-1]:  # Exclude root
        is_right_node = current_index % 2
        sibling_index = current_index - 1 if is_right_node else current_index + 1
        parent_index = current_index // 2
        
        # Add sibling hash to proof if it exists
        if sibling_index < len(level):
            proof.append({"hash": level[sibling_index]["hash"], "is_right": is_right_node})
        else:
            proof.append({"hash": level[current_index]["hash"], "is_right": is_right_node})
        
        current_index = parent_index
    
    return proof

def verify_merkle_proof(target, proof, merkle_root, is_file_path=False):
    """Verify a data block or file using a Merkle Proof."""
    current_hash = hash_file(target) if is_file_path else hash_data(target)
    for step in proof:
        sibling_hash = step["hash"]
        is_right = step["is_right"]
        if is_right:
            combined = current_hash + sibling_hash
        else:
            combined = sibling_hash + current_hash
        current_hash = hashlib.sha256(combined.encode('utf-8')).hexdigest()
    
    return current_hash == merkle_root

def main():
    parser = argparse.ArgumentParser(description="Merkle Tree CLI Tool")
    parser.add_argument("data", nargs="*", help="Data blocks to build the Merkle Tree")
    parser.add_argument("--input-file", help="File containing data blocks (one per line)")
    parser.add_argument("--directory", help="Directory to build Merkle Tree from file contents")
    parser.add_argument("--output-file", help="File to save the Merkle Tree JSON")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output")
    parser.add_argument("--verify", help="Verify if a data block or file is in the tree")
    
    args = parser.parse_args()

    # Read data blocks
    data_blocks = args.data
    is_file_paths = False

    if args.directory:
        if not os.path.isdir(args.directory):
            print(f"Error: Directory '{args.directory}' not found.")
            return
        data_blocks = get_files_in_directory(args.directory)
        is_file_paths = True
        if not data_blocks:
            print(f"Error: No files found in directory '{args.directory}'.")
            return

    if args.input_file:
        if not os.path.exists(args.input_file):
            print(f"Error: Input file '{args.input_file}' not found.")
            return
        with open(args.input_file, 'r') as f:
            data_blocks.extend(line.strip() for line in f if line.strip())

    if not data_blocks:
        print("Error: No data blocks or files provided.")
        return

    # Build Merkle Tree
    root_node, tree_levels = build_merkle_tree(data_blocks, is_file_paths)
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

    # Verify data block or file if requested
    if args.verify:
        proof = generate_merkle_proof(args.verify, data_blocks, tree_levels, is_file_paths)
        if proof is None:
            print(f"Verification failed: '{args.verify}' not found in the tree.")
        else:
            is_valid = verify_merkle_proof(args.verify, proof, root_node["hash"], is_file_paths)
            print(f"\nVerification for '{args.verify}': {'Valid' if is_valid else 'Invalid'}")
            print("Merkle Proof:", json.dumps(proof, indent=2 if args.pretty else None))

if __name__ == "__main__":
    main()