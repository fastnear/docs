#!/usr/bin/env node

/**
 * Refresh example values in RPC YAML files with fresh data from mainnet and testnet.
 *
 * Fetches the latest finalized block, finds a recent transaction + receipt,
 * and retrieves a real access key — then patches all affected YAML files
 * so "Try It" examples work out of the box.
 *
 * Uses structural YAML navigation (eemeli/yaml parseDocument + getIn) to
 * locate each value's byte range, then performs surgical string replacement
 * so re-runs are idempotent and formatting is fully preserved.
 *
 * Usage: node scripts/refresh-examples.js
 */

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const RPCS_DIR = path.join(__dirname, '..', 'rpcs');

const NETWORKS = {
  mainnet: {
    url: 'https://rpc.mainnet.fastnear.com',
    account: 'mike.near',
  },
  testnet: {
    url: 'https://rpc.testnet.fastnear.com',
    account: 'mike.testnet',
  },
};

// ---------------------------------------------------------------------------
// RPC helpers
// ---------------------------------------------------------------------------

const RPC_TIMEOUT_MS = 10_000;

async function sendRpc(url, method, params) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'refresh', method, params }),
      signal: controller.signal,
    });
    const json = await res.json();
    if (json.error) {
      throw new Error(`RPC ${method}: ${JSON.stringify(json.error)}`);
    }
    return json.result;
  } finally {
    clearTimeout(timer);
  }
}

/** Lightweight fallback: GET /status returns latest_block_hash + latest_block_height */
async function fetchStatus(networkUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const res = await fetch(`${networkUrl}/status`, { signal: controller.signal });
    if (!res.ok) throw new Error(`/status returned ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchNetworkData(networkUrl, account) {
  // 1. Latest finalized block (try RPC first, fall back to /status)
  let blockHeight, blockHash, chunkHash;
  try {
    const block = await sendRpc(networkUrl, 'block', { finality: 'final' });
    blockHeight = block.header.height;
    blockHash = block.header.hash;
    chunkHash = block.chunks[0].chunk_hash;
  } catch (e) {
    console.warn(`  RPC block call failed, trying /status fallback: ${e.message}`);
    const status = await fetchStatus(networkUrl);
    blockHeight = status.sync_info.latest_block_height;
    blockHash = status.sync_info.latest_block_hash;
    chunkHash = null; // /status doesn't provide chunk hashes
  }

  // Verify block hash is queryable and get full block object for tx walking
  let fullBlock = null;
  try {
    fullBlock = await sendRpc(networkUrl, 'block', { block_id: blockHash });
    if (!fullBlock.header) throw new Error('missing header');
    // Backfill chunkHash if we got it from /status fallback
    if (!chunkHash && fullBlock.chunks && fullBlock.chunks.length > 0) {
      chunkHash = fullBlock.chunks[0].chunk_hash;
    }
  } catch (e) {
    console.warn(`  Block hash verification failed: ${e.message}`);
  }

  // 2. Walk recent blocks to find a transaction (and derive a receipt ID)
  //    Time-budgeted: stop after 15s to avoid blocking the build on slow networks
  let txHash = null;
  let txSender = null;
  let receiptId = null;
  let currentBlock = fullBlock;
  const txSearchDeadline = Date.now() + 15_000;

  for (let attempt = 0; currentBlock && attempt < 100 && !txHash; attempt++) {
    if (Date.now() > txSearchDeadline) {
      console.warn(`  Tx search timed out after ${attempt} blocks`);
      break;
    }
    const chunkResults = await Promise.allSettled(
      currentBlock.chunks.map(ch =>
        sendRpc(networkUrl, 'chunk', { chunk_id: ch.chunk_hash })
      )
    );
    for (const r of chunkResults) {
      if (r.status === 'fulfilled' && r.value.transactions?.length > 0) {
        txHash = r.value.transactions[0].hash;
        txSender = r.value.transactions[0].signer_id;
        break;
      }
    }
    if (txHash) break;
    try {
      currentBlock = await sendRpc(networkUrl, 'block', { block_id: currentBlock.header.prev_hash });
    } catch { break; }
  }

  // Get a receipt ID from the transaction status
  if (txHash) {
    try {
      const txResult = await sendRpc(networkUrl, 'tx', {
        tx_hash: txHash,
        sender_account_id: txSender,
        wait_until: 'FINAL',
      });
      if (txResult.receipts_outcome && txResult.receipts_outcome.length > 0) {
        receiptId = txResult.receipts_outcome[0].id;
      }
    } catch (e) {
      console.warn(`  Warning: could not get receipt for tx ${txHash}: ${e.message}`);
    }
  }

  // 3. Real access key for the account
  let publicKey = null;
  try {
    const keys = await sendRpc(networkUrl, 'query', {
      request_type: 'view_access_key_list',
      finality: 'final',
      account_id: account,
    });
    if (keys.keys && keys.keys.length > 0) {
      publicKey = keys.keys[0].public_key;
    }
  } catch (e) {
    console.warn(`  Warning: could not get access keys for ${account}: ${e.message}`);
  }

  return { blockHeight, blockHash, chunkHash, txHash, txSender, receiptId, publicKey, account };
}

// ---------------------------------------------------------------------------
// Structural YAML patching
// ---------------------------------------------------------------------------

/**
 * Path to an example param field inside an OpenAPI per-operation YAML.
 * All 13 files share this uniform structure.
 */
function paramPath(network, field) {
  return ['paths', '/', 'post', 'requestBody', 'content', 'application/json', 'examples', network, 'value', 'params', field];
}

/**
 * Format a replacement value to match the original YAML node's quoting style.
 * - QUOTE_DOUBLE nodes → "value"
 * - QUOTE_SINGLE nodes → 'value'
 * - PLAIN nodes → value (as-is)
 */
function formatValue(newValue, nodeType) {
  const s = String(newValue);
  if (nodeType === 'QUOTE_DOUBLE') return `"${s}"`;
  if (nodeType === 'QUOTE_SINGLE') return `'${s}'`;
  return s;
}

/**
 * Declarative update map — each entry describes one YAML file and the
 * param fields to set for mainnet and testnet examples.
 *
 * Value functions receive the fetched network data object and return the
 * new value (or null/undefined to skip).
 */
const UPDATES = [
  {
    file: 'account/view_access_key.yaml',
    params: {
      public_key: { mainnet: d => d.publicKey, testnet: d => d.publicKey },
    },
  },
  {
    file: 'block/block_by_height.yaml',
    params: {
      block_id: { mainnet: d => d.blockHeight, testnet: d => d.blockHeight },
    },
  },
  {
    file: 'block/block_by_id.yaml',
    params: {
      block_id: { mainnet: d => d.blockHash, testnet: d => d.blockHash },
    },
  },
  {
    file: 'block/block_effects.yaml',
    params: {
      block_id: { mainnet: d => d.blockHeight, testnet: d => d.blockHeight },
    },
  },
  {
    file: 'protocol/chunk_by_hash.yaml',
    params: {
      chunk_id: { mainnet: d => d.chunkHash, testnet: d => d.chunkHash },
    },
  },
  {
    file: 'protocol/chunk_by_block_shard.yaml',
    params: {
      block_id: { mainnet: d => d.blockHash, testnet: d => d.blockHash },
    },
  },
  {
    file: 'protocol/gas_price_by_block.yaml',
    params: {
      block_id: { mainnet: d => d.blockHash, testnet: d => d.blockHash },
    },
  },
  {
    file: 'protocol/next_light_client_block.yaml',
    params: {
      last_block_hash: { mainnet: d => d.blockHash, testnet: d => d.blockHash },
    },
  },
  {
    file: 'protocol/light_client_proof.yaml',
    params: {
      light_client_head:  { mainnet: d => d.blockHash, testnet: d => d.blockHash },
      transaction_hash:   { mainnet: d => d.txHash,    testnet: d => d.txHash },
      sender_id:          { mainnet: d => d.txSender,  testnet: d => d.txSender },
    },
  },
  {
    file: 'protocol/EXPERIMENTAL_light_client_proof.yaml',
    params: {
      light_client_head:  { mainnet: d => d.blockHash,  testnet: d => d.blockHash },
      transaction_hash:   { mainnet: d => d.txHash,     testnet: d => d.txHash },
      receipt_id:         { mainnet: d => d.receiptId,   testnet: d => d.receiptId },
      sender_id:          { mainnet: d => d.txSender,    testnet: d => d.txSender },
      receiver_id:        { mainnet: d => d.txSender,    testnet: d => d.txSender },
    },
  },
  {
    file: 'transaction/tx_status.yaml',
    params: {
      tx_hash:            { mainnet: d => d.txHash,    testnet: d => d.txHash },
      sender_account_id:  { mainnet: d => d.txSender,  testnet: d => d.txSender },
    },
  },
  {
    file: 'transaction/EXPERIMENTAL_tx_status.yaml',
    params: {
      tx_hash:            { mainnet: d => d.txHash,    testnet: d => d.txHash },
      sender_account_id:  { mainnet: d => d.txSender,  testnet: d => d.txSender },
    },
  },
  {
    file: 'transaction/EXPERIMENTAL_receipt.yaml',
    params: {
      receipt_id: { mainnet: d => d.receiptId, testnet: d => d.receiptId },
    },
  },
];

/**
 * Apply all updates to a single file using range-based surgical replacement.
 *
 * 1. Parse the YAML to navigate structurally to each scalar node.
 * 2. Collect {offset, length, replacement} edits from end-to-start order.
 * 3. Splice them into the raw text so offsets stay valid.
 */
function patchFile(filePath, entry, data) {
  const text = fs.readFileSync(filePath, 'utf8');
  const doc = YAML.parseDocument(text);

  // Collect edits: { start, valueEnd, replacement }
  const edits = [];

  for (const [field, networks] of Object.entries(entry.params)) {
    for (const [network, valueFn] of Object.entries(networks)) {
      if (!data[network]) continue; // network fetch failed entirely
      const newValue = valueFn(data[network]);
      if (newValue == null) continue;

      const p = paramPath(network, field);
      const node = doc.getIn(p, true);
      if (!node || !node.range) continue;

      const oldValue = node.value;
      if (String(oldValue) === String(newValue)) continue;

      const [start, valueEnd] = node.range;
      const replacement = formatValue(newValue, node.type);
      edits.push({ start, valueEnd, replacement, network, field, newValue });
    }
  }

  if (edits.length === 0) return false;

  // Sort edits by start offset descending so splicing doesn't shift later offsets
  edits.sort((a, b) => b.start - a.start);

  let result = text;
  for (const edit of edits) {
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.valueEnd);
    console.log(`  ${entry.file}: ${edit.network} ${edit.field} -> ${edit.newValue}`);
  }

  fs.writeFileSync(filePath, result, 'utf8');
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Fetching fresh data from NEAR networks...\n');

  const data = {};
  for (const [network, config] of Object.entries(NETWORKS)) {
    console.log(`${network} (${config.url}):`);
    try {
      data[network] = await fetchNetworkData(config.url, config.account);
      const d = data[network];
      console.log(`  block:      ${d.blockHeight} / ${d.blockHash}`);
      console.log(`  chunk:      ${d.chunkHash || '(none)'}`);
      console.log(`  tx:         ${d.txHash || '(none)'} from ${d.txSender || 'n/a'}`);
      console.log(`  receipt:    ${d.receiptId || '(none)'}`);
      console.log(`  public_key: ${d.publicKey || '(none)'}`);
      const missing = ['blockHash', 'blockHeight', 'chunkHash', 'txHash', 'receiptId', 'publicKey']
        .filter(k => !d[k]);
      if (missing.length > 0) {
        console.warn(`  Missing data points: ${missing.join(', ')}`);
      }
    } catch (e) {
      console.warn(`  FAILED: ${e.message}`);
      data[network] = null;
    }
    console.log();
  }

  if (!Object.values(data).some(Boolean)) {
    console.error('All networks failed — no files updated.');
    process.exit(1);
  }

  console.log('Updating YAML files...\n');
  let filesUpdated = 0;

  for (const entry of UPDATES) {
    const filePath = path.join(RPCS_DIR, entry.file);
    if (patchFile(filePath, entry, data)) {
      filesUpdated++;
    }
  }

  console.log(`\nDone! Updated ${filesUpdated} file(s).`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
