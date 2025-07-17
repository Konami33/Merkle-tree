#!/usr/bin/env node

/**
 * Redis Integration Test Script
 * Tests the Redis caching functionality of the Merkle Tree Service
 */

require('dotenv').config();
const redisService = require('./services/redisService');
const config = require('./config/app');

async function testRedisIntegration() {
    console.log('🧪 Testing Redis Integration...\n');

    try {
        // Initialize Redis service
        console.log('1. Initializing Redis service...');
        await redisService.init(config);
        
        if (!redisService.isConnected()) {
            console.log('❌ Redis not connected - testing in degraded mode');
            return;
        }
        
        console.log('✅ Redis connected successfully\n');

        // Test basic operations
        console.log('2. Testing basic cache operations...');
        
        // Test SET/GET
        const testKey = 'test:integration';
        const testValue = { timestamp: new Date().toISOString(), test: true };
        
        await redisService.set(testKey, testValue, 60);
        const retrieved = await redisService.get(testKey);
        
        if (JSON.stringify(retrieved) === JSON.stringify(testValue)) {
            console.log('✅ SET/GET operations working');
        } else {
            console.log('❌ SET/GET operations failed');
        }

        // Test Merkle-specific operations
        console.log('3. Testing Merkle-specific cache operations...');
        
        // Test latest root hash caching
        const testRootHash = 'test_hash_' + Date.now();
        await redisService.setLatestRootHash(testRootHash, { test: true });
        const cachedRootData = await redisService.getLatestRootHash();
        
        if (cachedRootData && cachedRootData.rootHash === testRootHash) {
            console.log('✅ Latest root hash caching working');
        } else {
            console.log('❌ Latest root hash caching failed');
        }

        // Test tree metadata caching
        const metadata = { rootId: 123, itemCount: 50, sourcePath: '/test' };
        await redisService.setTreeMetadata(testRootHash, metadata);
        const cachedMetadata = await redisService.getTreeMetadata(testRootHash);
        
        if (cachedMetadata && cachedMetadata.rootId === 123) {
            console.log('✅ Tree metadata caching working');
        } else {
            console.log('❌ Tree metadata caching failed');
        }

        // Test build status caching
        const buildStatus = { inProgress: false, lastBuild: new Date().toISOString() };
        await redisService.setBuildStatus(buildStatus);
        const cachedStatus = await redisService.getBuildStatus();
        
        if (cachedStatus && cachedStatus.inProgress === false) {
            console.log('✅ Build status caching working');
        } else {
            console.log('❌ Build status caching failed');
        }

        // Test health check
        console.log('4. Testing health check...');
        const health = await redisService.getHealthStatus();
        
        if (health.status === 'healthy') {
            console.log('✅ Health check working');
        } else {
            console.log('❌ Health check failed:', health);
        }

        // Test cache statistics
        console.log('5. Testing cache statistics...');
        const stats = await redisService.getCacheStats();
        
        if (stats.available) {
            console.log('✅ Cache statistics working');
            console.log(`   - Merkle keys in cache: ${stats.merkleKeys}`);
        } else {
            console.log('❌ Cache statistics failed');
        }

        // Clean up test data
        console.log('6. Cleaning up test data...');
        await redisService.invalidateCache('test:*');
        await redisService.del(`merkle:tree_metadata:${testRootHash}`);
        console.log('✅ Cleanup completed');

        console.log('\n🎉 Redis integration test completed successfully!');
        
    } catch (error) {
        console.error('❌ Redis integration test failed:', error);
    } finally {
        // Disconnect
        await redisService.disconnect();
        console.log('👋 Disconnected from Redis');
        process.exit(0);
    }
}

// Performance test
async function performanceTest() {
    console.log('\n⚡ Running performance test...');
    
    const iterations = 100;
    const testKey = 'perf:test';
    const testData = { large: 'data'.repeat(1000), timestamp: new Date() };
    
    // Measure SET operations
    const setStart = Date.now();
    for (let i = 0; i < iterations; i++) {
        await redisService.set(`${testKey}:${i}`, testData, 300);
    }
    const setTime = Date.now() - setStart;
    
    // Measure GET operations
    const getStart = Date.now();
    for (let i = 0; i < iterations; i++) {
        await redisService.get(`${testKey}:${i}`);
    }
    const getTime = Date.now() - getStart;
    
    console.log(`📊 Performance Results (${iterations} operations):`);
    console.log(`   - SET operations: ${setTime}ms (${(setTime/iterations).toFixed(2)}ms avg)`);
    console.log(`   - GET operations: ${getTime}ms (${(getTime/iterations).toFixed(2)}ms avg)`);
    
    // Cleanup
    await redisService.invalidateCache('perf:*');
}

// Run tests
async function runAllTests() {
    await testRedisIntegration();
    
    if (redisService.isConnected()) {
        await performanceTest();
    }
}

// Handle script arguments
const args = process.argv.slice(2);
if (args.includes('--performance-only')) {
    (async () => {
        await redisService.init(config);
        await performanceTest();
        await redisService.disconnect();
        process.exit(0);
    })();
} else {
    runAllTests();
}
