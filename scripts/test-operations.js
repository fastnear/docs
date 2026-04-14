#!/usr/bin/env node

/**
 * Test script to verify representative operation pages are accessible.
 * Run while preview server is active.
 */

const http = require('http');
const https = require('https');

const OPERATIONS = [
  '/rpcs/account/view_account',
  '/rpcs/account/view_access_key',
  '/rpcs/block/block_by_height',
  '/rpcs/transaction/tx_status',
  '/apis/fastnear/v1/account_full',
  '/apis/fastnear/openapi/accounts/account_full_v1',
  '/apis/fastnear/v1/account_full?preset=ecosystem-account',
  '/apis/transactions/v0/transactions',
  '/apis/transactions/openapi/account/get_account',
  '/apis/transactions/v0/account?preset=recent-account-history',
  '/apis/transfers/v0/transfers',
  '/apis/transfers/openapi/transfers/get_transfers_by_account',
  '/apis/transfers/v0/transfers?preset=recent-near-transfers',
  '/apis/kv-fastdata/v0/multi',
  '/apis/neardata/v0/block',
  '/apis/neardata/v0/block?preset=genesis&network=testnet',
  '/apis/neardata/v0/first_block',
  '/apis/neardata/system/health',
];

const BODY_TESTS = [
  {
    path: '/rpcs/block/block_by_height',
    body: { jsonrpc: '2.0', id: 'fastnear', method: 'block', params: { block_id: 186464793 } }
  },
  {
    path: '/rpcs/account/view_account',
    body: { jsonrpc: '2.0', id: 'fastnear', method: 'query', params: { request_type: 'view_account', finality: 'final', account_id: 'near' } }
  },
  {
    path: '/apis/transactions/v0/account',
    body: { account_id: 'intents.near', desc: true, is_real_signer: true, is_success: true, limit: 50 }
  },
  {
    path: '/apis/transfers/v0/transfers',
    body: {
      account_id: 'intents.near',
      asset_id: 'near',
      desc: true,
      direction: 'receiver',
      limit: 10,
      min_amount: '1000000000000000000000000'
    }
  },
  {
    path: '/apis/neardata/v0/first_block?apiKey=test-key',
    body: null
  }
];

const cliBaseUrl = process.argv[2];
const envBaseUrl = process.env.BASE_URL;
const PORT = process.env.PORT || 4000;
const BASE_URL = cliBaseUrl || envBaseUrl || `http://127.0.0.1:${PORT}`;
const TRANSPORT = BASE_URL.startsWith('https://') ? https : http;

function testUrl(path) {
  return new Promise((resolve) => {
    const url = `${BASE_URL}${path}`;
    
    TRANSPORT.get(url, (res) => {
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
  console.log(`Testing legacy verification routes at ${BASE_URL}\n`);
  
  let results = {
    passed: 0,
    failed: 0
  };
  const failedPaths = [];
  
  for (const path of OPERATIONS) {
    const success = await testUrl(path);
    if (success) {
      results.passed++;
    } else {
      results.failed++;
      failedPaths.push(path);
    }
  }

  console.log('\n--- Body param tests ---\n');

  for (const { path, body } of BODY_TESTS) {
    const separator = path.includes('?') ? '&' : '?';
    const fullPath = body
      ? `${path}${separator}body=${encodeURIComponent(JSON.stringify(body))}`
      : path;
    const success = await testUrl(fullPath);
    if (success) {
      results.passed++;
    } else {
      results.failed++;
      failedPaths.push(fullPath);
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
TRANSPORT.get(BASE_URL, (res) => {
  runTests();
}).on('error', () => {
  console.error(`❌ Endpoint not reachable at ${BASE_URL}`);
  if (!cliBaseUrl && !envBaseUrl) {
    console.log('\nStart the preview server first:');
    console.log('  npm run preview');
  }
  process.exit(1);
});
