-- Merkle Tree Service Database Schema
-- Phase 1: Core tables for storing Merkle trees and root hashes

-- Create database if it doesn't exist (run this manually)
-- CREATE DATABASE merkle_db;

-- Table for storing Merkle root metadata
CREATE TABLE IF NOT EXISTS merkle_roots (
    id SERIAL PRIMARY KEY,
    root_hash VARCHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    item_count INTEGER NOT NULL CHECK (item_count > 0),
    source_path TEXT NOT NULL
);

-- Table for storing the full tree JSON data
CREATE TABLE IF NOT EXISTS merkle_tree_data (
    root_id INTEGER REFERENCES merkle_roots(id) ON DELETE CASCADE PRIMARY KEY,
    tree_json JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_merkle_roots_hash ON merkle_roots(root_hash);
CREATE INDEX IF NOT EXISTS idx_merkle_roots_created ON merkle_roots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_merkle_tree_data_created ON merkle_tree_data(created_at DESC);

-- Add a GIN index for JSONB operations (useful for future queries)
CREATE INDEX IF NOT EXISTS idx_merkle_tree_data_json ON merkle_tree_data USING GIN(tree_json);

-- Insert a comment to track schema version
COMMENT ON TABLE merkle_roots IS 'Merkle Tree Service v1.0.0 - Phase 1 Schema';

-- View for easy querying of complete tree data
CREATE OR REPLACE VIEW merkle_trees_view AS
SELECT 
    mr.id,
    mr.root_hash,
    mr.item_count,
    mr.source_path,
    mr.created_at,
    mtd.tree_json
FROM merkle_roots mr
LEFT JOIN merkle_tree_data mtd ON mr.id = mtd.root_id
ORDER BY mr.created_at DESC;