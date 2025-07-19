#!/usr/bin/env node

/**
 * S3/MinIO Integration Test Script
 * Tests the S3 storage functionality of the Merkle Tree Service
 */

require('dotenv').config();
const s3Service = require('./services/s3Service');
const config = require('./config/app');

async function testS3Integration() {
    console.log('🪣 Testing S3/MinIO Integration...\n');

    try {
        // Set S3 enabled for testing
        config.S3_ENABLED = true;
        
        console.log('1. Initializing S3 service...');
        await s3Service.init(config);
        
        if (!s3Service.isS3Connected()) {
            console.log('❌ S3 not connected');
            console.log('💡 Make sure MinIO is running: docker-compose up -d minio');
            return;
        }
        
        console.log('✅ S3/MinIO connected successfully\n');

        // Test storing tree data
        console.log('2. Testing tree data storage...');
        
        const testRootHash = 'test_hash_' + Date.now();
        const testTreeData = {
            hash: testRootHash,
            left: { hash: 'left_hash', data: 'test_data_1' },
            right: { hash: 'right_hash', data: 'test_data_2' }
        };
        
        const storeResult = await s3Service.storeTreeData(testRootHash, testTreeData, {
            itemCount: 2,
            sourcePath: '/test/path'
        });
        
        console.log('✅ Tree data stored successfully');
        console.log(`   - Tree ID: ${storeResult.treeId}`);
        console.log(`   - Root Hash: ${storeResult.rootHash}`);

        // Test retrieving latest root hash
        console.log('3. Testing latest root hash retrieval...');
        
        const latestHash = await s3Service.getLatestRootHash();
        
        if (latestHash === testRootHash) {
            console.log('✅ Latest root hash retrieval working');
        } else {
            console.log('❌ Latest root hash retrieval failed');
            console.log(`   Expected: ${testRootHash}, Got: ${latestHash}`);
        }

        // Test retrieving tree by hash
        console.log('4. Testing tree retrieval by hash...');
        
        const retrievedTree = await s3Service.getTreeByRootHash(testRootHash);
        
        if (retrievedTree && retrievedTree.rootHash === testRootHash) {
            console.log('✅ Tree retrieval by hash working');
            console.log(`   - Item Count: ${retrievedTree.itemCount}`);
            console.log(`   - Source Path: ${retrievedTree.sourcePath}`);
        } else {
            console.log('❌ Tree retrieval by hash failed');
        }

        // Test getting recent roots
        console.log('5. Testing recent roots retrieval...');
        
        const recentRoots = await s3Service.getRecentRoots(5);
        
        if (recentRoots && recentRoots.length > 0) {
            console.log('✅ Recent roots retrieval working');
            console.log(`   - Found ${recentRoots.length} recent trees`);
        } else {
            console.log('❌ Recent roots retrieval failed');
        }

        // Test connection health
        console.log('6. Testing connection health...');
        
        const healthCheck = await s3Service.testConnection();
        
        if (healthCheck.connected) {
            console.log('✅ Health check working');
            console.log(`   - Endpoint: ${healthCheck.endpoint}`);
            console.log(`   - Bucket: ${healthCheck.bucket}`);
        } else {
            console.log('❌ Health check failed:', healthCheck.error);
        }

        // Test statistics
        console.log('7. Testing statistics...');
        
        const stats = await s3Service.getStats();
        
        if (stats.total_trees >= 1) {
            console.log('✅ Statistics working');
            console.log(`   - Total trees: ${stats.total_trees}`);
            console.log(`   - Total size: ${stats.total_size_bytes} bytes`);
        } else {
            console.log('❌ Statistics failed');
        }

        console.log('\n🎉 S3/MinIO integration test completed successfully!');
        console.log('\n📊 Storage Structure in MinIO:');
        console.log('   - metadata/roots/: Root metadata files');
        console.log('   - trees/: Full tree JSON data');
        console.log('   - metadata/latest-root.json: Latest root pointer');
        
    } catch (error) {
        console.error('❌ S3/MinIO integration test failed:', error);
    }
}

// Storage comparison test
async function storageComparisonTest() {
    console.log('\n⚡ Running storage performance comparison...');
    
    const iterations = 10;
    const testData = {
        hash: 'perf_test_' + Date.now(),
        data: 'performance test data'.repeat(100)
    };
    
    // Measure S3 operations
    console.log(`📊 Testing ${iterations} storage operations...`);
    
    const start = Date.now();
    for (let i = 0; i < iterations; i++) {
        const hash = `perf_test_${i}_${Date.now()}`;
        await s3Service.storeTreeData(hash, testData, {
            itemCount: 1,
            sourcePath: '/perf/test'
        });
    }
    const storeTime = Date.now() - start;
    
    const retrieveStart = Date.now();
    for (let i = 0; i < iterations; i++) {
        await s3Service.getLatestRootHash();
    }
    const retrieveTime = Date.now() - retrieveStart;
    
    console.log(`📈 Performance Results (${iterations} operations):`);
    console.log(`   - Store operations: ${storeTime}ms (${(storeTime/iterations).toFixed(2)}ms avg)`);
    console.log(`   - Retrieve operations: ${retrieveTime}ms (${(retrieveTime/iterations).toFixed(2)}ms avg)`);
}

// Run tests
async function runAllTests() {
    await testS3Integration();
    
    if (s3Service.isS3Connected()) {
        await storageComparisonTest();
    }
    
    console.log('\n💡 Next steps:');
    console.log('   1. Start the service: npm start');
    console.log('   2. Check health: curl http://localhost:3000/health');
    console.log('   3. View MinIO console: http://localhost:9001');
    console.log('   4. Monitor with: curl http://localhost:3000/health/status');
}

// Handle script arguments
const args = process.argv.slice(2);
if (args.includes('--storage-only')) {
    (async () => {
        await s3Service.init(config);
        await storageComparisonTest();
        process.exit(0);
    })();
} else {
    runAllTests().then(() => process.exit(0));
}
