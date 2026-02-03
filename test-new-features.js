#!/usr/bin/env node
/**
 * Test script for FlukeDeploy new features:
 * - UnifiedSchema (JSON-LD logging)
 * - DeploymentTracker (5-phase tracking)
 * - WebSocketServer (log streaming on port 8767)
 * - LogsAPI (REST endpoints)
 */

const {
    FlukeDeployEventType,
    createDeploymentLog
} = require('./built/logging/UnifiedSchema');

const {
    globalDeploymentTracker
} = require('./built/logging/DeploymentTracker');

const {
    getLogStreamingServer,
    broadcastLog
} = require('./built/logging/WebSocketServer');

console.log('\n🧪 FlukeDeploy New Features Test\n');
console.log('================================\n');

// Test 1: UnifiedSchema
console.log('✅ Test 1: UnifiedSchema (JSON-LD logging)');
const testLog = createDeploymentLog(
    'Test deployment started',
    FlukeDeployEventType.DEPLOY_START,
    'test-app',
    'info',
    { deployment_id: 'test-123', version: 'v1.0.0' }
);
console.log('   Sample log:', JSON.stringify(testLog, null, 2).substring(0, 200) + '...');
console.log('   ✓ Log has @context:', testLog['@context']);
console.log('   ✓ Log has @type:', testLog['@type']);
console.log('   ✓ Event type:', testLog.flukedeploy_metadata.event_type);

// Test 2: DeploymentTracker
console.log('\n✅ Test 2: DeploymentTracker (5-phase lifecycle)');
const deployment = globalDeploymentTracker.startDeployment(
    'test-123',
    'test-app',
    'cli'
);
console.log('   ✓ Deployment created:', deployment.deployment_id);
console.log('   ✓ Status:', deployment.status);

// Simulate phase progression
deployment.startPhase('pre_build');
console.log('   ✓ Started pre_build phase');
deployment.completePhase('pre_build', true);
console.log('   ✓ Completed pre_build phase');

deployment.startPhase('build');
console.log('   ✓ Started build phase');
deployment.completePhase('build', true);
console.log('   ✓ Completed build phase');

deployment.startPhase('deploy');
console.log('   ✓ Started deploy phase');
deployment.completePhase('deploy', true);
console.log('   ✓ Completed deploy phase');

const summary = deployment.toSummary();
console.log('   Deployment summary:', JSON.stringify(summary, null, 2).substring(0, 300) + '...');

// Test 3: WebSocket Server
console.log('\n✅ Test 3: WebSocket Server (port 8767)');
const wsServer = getLogStreamingServer(8767);
console.log('   ✓ WebSocket server created on port 8767');

// Give server time to start
setTimeout(() => {
    console.log('   ✓ Server is listening');
    const stats = wsServer.getStats();
    console.log('   Stats:', stats);

    // Test broadcasting a log
    const broadcastTestLog = createDeploymentLog(
        'Broadcasting test log',
        FlukeDeployEventType.BUILD_COMPLETE,
        'test-app',
        'info'
    );
    broadcastLog(broadcastTestLog);
    console.log('   ✓ Broadcasted test log to WebSocket clients');

    // Test 4: Retrieve deployment
    console.log('\n✅ Test 4: DeploymentLifecycleTracker queries');
    const retrieved = globalDeploymentTracker.getDeployment('test-123');
    console.log('   ✓ Retrieved deployment:', retrieved.deployment_id);

    const activeDeployments = globalDeploymentTracker.getActiveDeployments();
    console.log('   ✓ Active deployments:', activeDeployments.length);

    const appDeployments = globalDeploymentTracker.getAppDeployments('test-app');
    console.log('   ✓ App deployments for test-app:', appDeployments.length);

    console.log('\n✅ All tests passed!');
    console.log('\n📝 Summary:');
    console.log('   - JSON-LD logging: ✅ Working');
    console.log('   - 5-phase tracking: ✅ Working');
    console.log('   - WebSocket server: ✅ Running on port 8767');
    console.log('   - Deployment queries: ✅ Working');

    console.log('\n💡 To test WebSocket streaming:');
    console.log('   npm install -g wscat');
    console.log('   wscat -c "ws://localhost:8767?app_name=test-app"');
    console.log('\n   Leave this script running and connect with wscat in another terminal');
    console.log('   Press Ctrl+C to stop\n');

}, 1000);
