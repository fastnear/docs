#!/usr/bin/env node

/**
 * Test script to verify operation pages are accessible
 * Run while preview server is active
 */

const http = require('http');

const OPERATIONS = [
  '/reference/operation/view_account',
  '/rpcs/account/view_account',
  '/rpcs/account/view_access_key',
  '/rpcs/block/block_by_height',
  '/rpcs/transaction/tx_status',
  '/apis'
];

const BODY_TESTS = [
  {
    path: '/rpcs/block/block_by_height',
    body: { jsonrpc: '2.0', id: 'fastnear', method: 'block', params: { block_id: 186464793 } }
  },
  {
    path: '/rpcs/account/view_account',
    body: { jsonrpc: '2.0', id: 'fastnear', method: 'query', params: { request_type: 'view_account', finality: 'final', account_id: 'near' } }
  }
];

const PORT = process.env.PORT || 4000;
const BASE_URL = `http://localhost:${PORT}`;

function testUrl(path) {
  return new Promise((resolve) => {
    const url = `${BASE_URL}${path}`;
    
    http.get(url, (res) => {
      if (res.statusCode === 200) {
        console.log(`✅ ${path} - OK`);
        resolve(true);
      } else if (res.statusCode === 404) {
        console.log(`❌ ${path} - NOT FOUND`);
        resolve(false);
      } else {
        console.log(`⚠️  ${path} - Status: ${res.statusCode}`);
        resolve(false);
      }
    }).on('error', (err) => {
      console.log(`❌ ${path} - Error: ${err.message}`);
      resolve(false);
    });
  });
}

async function runTests() {
  console.log(`Testing Redocly endpoints at ${BASE_URL}\n`);
  
  let results = {
    passed: 0,
    failed: 0
  };
  
  for (const path of OPERATIONS) {
    const success = await testUrl(path);
    if (success) {
      results.passed++;
    } else {
      results.failed++;
    }
  }

  console.log('\n--- Body param tests ---\n');

  for (const { path, body } of BODY_TESTS) {
    const bodyParam = encodeURIComponent(JSON.stringify(body));
    const fullPath = `${path}?body=${bodyParam}`;
    const success = await testUrl(fullPath);
    if (success) {
      results.passed++;
    } else {
      results.failed++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`Results: ${results.passed} passed, ${results.failed} failed`);
  
  if (results.failed > 0) {
    console.log('\nNote: Operation pages (/reference/operation/*) require:');
    console.log('1. reference.page.yaml with pagination:item');
    console.log('2. Restart of preview server');
    console.log('3. Correct operationId in OpenAPI specs');
  }
}

// Check if server is running first
http.get(BASE_URL, (res) => {
  runTests();
}).on('error', () => {
  console.error(`❌ Preview server not running at ${BASE_URL}`);
  console.log('\nStart the preview server first:');
  console.log('  npm run preview');
  process.exit(1);
});