require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('../config/app');

async function runMigration() {
    const pool = new Pool({
        connectionString: config.DATABASE_URL
    });

    try {
        console.log('Connecting to database...');
        const client = await pool.connect();
        
        console.log('Reading migration file...');
        const migrationPath = path.join(__dirname, '../migrations/001_initial_schema.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('Running migration...');
        await client.query(migrationSQL);
        
        console.log('Migration completed successfully!');
        
        // Test the schema by inserting a test record
        console.log('Testing schema with test data...');
        const testResult = await client.query(`
            INSERT INTO merkle_roots (root_hash, item_count, source_path) 
            VALUES ('test_hash_' || extract(epoch from now()), 1, '/test/path') 
            RETURNING id, root_hash, created_at
        `);
        
        console.log('Test record created:', testResult.rows[0]);
        
        // Clean up test record
        await client.query('DELETE FROM merkle_roots WHERE root_hash LIKE $1', ['test_hash_%']);
        console.log('Test record cleaned up');
        
        client.release();
        
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run migration if this script is executed directly
if (require.main === module) {
    runMigration().then(() => {
        console.log('Migration script completed');
        process.exit(0);
    }).catch(error => {
        console.error('Migration script failed:', error);
        process.exit(1);
    });
}

module.exports = { runMigration };