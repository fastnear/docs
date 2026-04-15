const {
  DISCOVERY_NETWORKS,
} = require('./rpc-example-config');

const RPC_TIMEOUT_MS = 10_000;
const INDEX_TIMEOUT_MS = 12_000;
const RAW_TX_SEARCH_BLOCK_LIMIT = 100;
const RAW_TX_SEARCH_TIME_BUDGET_MS = 15_000;
const EMPTY_CHUNK_HASH = '11111111111111111111111111111111';

function withTimeout(timeoutMs, fn) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return Promise.resolve()
    .then(() => fn(controller.signal))
    .finally(() => clearTimeout(timer));
}

function createLogger(log) {
  return typeof log === 'function' ? log : () => {};
}

function createRpcError(method, error) {
  const rpcError = new Error(`RPC ${method}: ${JSON.stringify(error)}`);
  rpcError.code = error?.code;
  rpcError.data = error?.data;
  rpcError.rpcError = error;
  return rpcError;
}

function getUsableChunk(block) {
  const chunks = Array.isArray(block?.chunks) ? block.chunks : [];
  return (
    chunks.find((chunk) => chunk?.chunk_hash && chunk.chunk_hash !== EMPTY_CHUNK_HASH) ||
    chunks[0] ||
    null
  );
}

async function fetchJson(url, options = {}, timeoutMs = RPC_TIMEOUT_MS) {
  return withTimeout(timeoutMs, async (signal) => {
    const response = await fetch(url, { ...options, signal });
    const text = await response.text();

    let value = null;
    if (text) {
      try {
        value = JSON.parse(text);
      } catch {
        value = text;
      }
    }

    return {
      ok: response.ok,
      response,
      text,
      value,
    };
  });
}

async function sendRpc(url, method, params, options = {}) {
  const requestId = options.id || 'rpc-example';
  const result = await fetchJson(
    url,
    {
      body: JSON.stringify({
        id: requestId,
        jsonrpc: '2.0',
        method,
        params,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
    options.timeoutMs || RPC_TIMEOUT_MS
  );

  if (!result.ok) {
    throw new Error(`RPC ${method}: HTTP ${result.response.status}`);
  }

  if (typeof result.value !== 'object' || result.value === null) {
    throw new Error(`RPC ${method}: Expected JSON object response`);
  }

  if (result.value.error) {
    throw createRpcError(method, result.value.error);
  }

  return result.value.result;
}

async function fetchStatus(networkUrl) {
  const result = await fetchJson(`${networkUrl.replace(/\/+$/, '')}/status`);
  if (!result.ok || typeof result.value !== 'object' || result.value === null) {
    throw new Error(`/status returned ${result.response.status}`);
  }
  return result.value;
}

async function fetchLatestBlockContext(networkUrl, options = {}) {
  const log = createLogger(options.log);

  let blockHeight = null;
  let blockHash = null;
  let chunkHash = null;
  let shardId = null;
  let epochId = null;
  let previousBlockHash = null;
  let fullBlock = null;

  try {
    const block = await sendRpc(networkUrl, 'block', { finality: 'final' }, { id: 'discover-block' });
    blockHeight = block?.header?.height ?? null;
    blockHash = block?.header?.hash ?? null;
    epochId = block?.header?.epoch_id ?? null;
    previousBlockHash = block?.header?.prev_hash ?? null;
    const usableChunk = getUsableChunk(block);
    chunkHash = usableChunk?.chunk_hash ?? null;
    shardId = usableChunk?.shard_id ?? null;
    fullBlock = block;
  } catch (error) {
    log(`  RPC block(finality) failed, trying /status fallback: ${error.message}`);
    const status = await fetchStatus(networkUrl);
    blockHeight = status?.sync_info?.latest_block_height ?? null;
    blockHash = status?.sync_info?.latest_block_hash ?? null;
  }

  if (blockHash) {
    try {
      const verifiedBlock = await sendRpc(
        networkUrl,
        'block',
        { block_id: blockHash },
        { id: 'discover-verify-block' }
      );
      fullBlock = verifiedBlock;
      epochId = epochId || verifiedBlock?.header?.epoch_id || null;
      previousBlockHash = previousBlockHash || verifiedBlock?.header?.prev_hash || null;
      const usableChunk = getUsableChunk(verifiedBlock);
      chunkHash = chunkHash || usableChunk?.chunk_hash || null;
      shardId = shardId ?? usableChunk?.shard_id ?? null;
    } catch (error) {
      log(`  Block hash verification failed: ${error.message}`);
    }
  }

  return {
    blockHash,
    blockHeight,
    chunkHash,
    epochId,
    fullBlock,
    previousBlockHash,
    shardId,
  };
}

async function fetchPublicKey(networkUrl, accountId) {
  const keys = await sendRpc(networkUrl, 'query', {
    account_id: accountId,
    finality: 'final',
    request_type: 'view_access_key_list',
  }, { id: 'discover-public-key' });

  return keys?.keys?.[0]?.public_key ?? null;
}

async function fetchIndexedAccountActivity(txIndexUrl, accountId, limit = 10) {
  const result = await fetchJson(
    `${txIndexUrl.replace(/\/+$/, '')}/v0/account`,
    {
      body: JSON.stringify({
        account_id: accountId,
        desc: true,
        limit,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
    INDEX_TIMEOUT_MS
  );

  if (!result.ok || typeof result.value !== 'object' || result.value === null) {
    throw new Error(`Indexed account activity failed with HTTP ${result.response.status}`);
  }

  return result.value.account_txs || [];
}

async function hydrateIndexedTransactions(txIndexUrl, txHashes) {
  const uniqueHashes = [...new Set(txHashes.filter(Boolean))].slice(0, 20);
  if (uniqueHashes.length === 0) {
    return [];
  }

  const result = await fetchJson(
    `${txIndexUrl.replace(/\/+$/, '')}/v0/transactions`,
    {
      body: JSON.stringify({ tx_hashes: uniqueHashes }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
    INDEX_TIMEOUT_MS
  );

  if (!result.ok || typeof result.value !== 'object' || result.value === null) {
    throw new Error(`Indexed transaction hydration failed with HTTP ${result.response.status}`);
  }

  return result.value.transactions || [];
}

function getIndexedReceiptId(transaction) {
  return (
    transaction?.execution_outcome?.outcome?.receipt_ids?.[0] ||
    transaction?.receipts?.[0]?.receipt?.receipt_id ||
    transaction?.data_receipts?.[0]?.receipt_id ||
    null
  );
}

function getIndexedTransactionCandidate(transaction) {
  const tx = transaction?.transaction;
  if (!tx?.hash || !tx?.signer_id) {
    return null;
  }

  return {
    finalExecutionStatus: 'FINAL',
    receiptId: getIndexedReceiptId(transaction),
    receiverId: tx.receiver_id || null,
    senderId: tx.signer_id,
    txHash: tx.hash,
  };
}

async function enrichTransactionCandidateWithRpc(networkUrl, candidate) {
  const txResult = await sendRpc(
    networkUrl,
    'tx',
    {
      sender_account_id: candidate.senderId,
      tx_hash: candidate.txHash,
      wait_until: 'FINAL',
    },
    { id: 'discover-tx' }
  );

  return {
    finalExecutionStatus: txResult?.final_execution_status || candidate.finalExecutionStatus || null,
    receiptId: txResult?.receipts_outcome?.[0]?.id || candidate.receiptId || null,
    receiverId: txResult?.transaction?.receiver_id || candidate.receiverId || null,
    senderId: txResult?.transaction?.signer_id || candidate.senderId || null,
    txHash: candidate.txHash,
  };
}

async function discoverIndexedTransactionContext(networkConfig, options = {}) {
  const log = createLogger(options.log);
  if (!networkConfig.txIndexUrl) {
    return null;
  }

  const candidateAccounts = [
    options.account,
    ...(networkConfig.discoveryAccounts || []),
  ].filter(Boolean);

  for (const accountId of [...new Set(candidateAccounts)]) {
    try {
      const activity = await fetchIndexedAccountActivity(
        networkConfig.txIndexUrl,
        accountId,
        options.limit || 10
      );
      if (activity.length === 0) {
        continue;
      }

      const hydratedTransactions = await hydrateIndexedTransactions(
        networkConfig.txIndexUrl,
        activity.map((item) => item.transaction_hash)
      );

      for (const transaction of hydratedTransactions) {
        const candidate = getIndexedTransactionCandidate(transaction);
        if (!candidate) {
          continue;
        }

        try {
          const enriched = await enrichTransactionCandidateWithRpc(networkConfig.url, candidate);
          return {
            ...enriched,
            sourceAccount: accountId,
            sourceKind: 'indexed',
          };
        } catch (error) {
          log(`  Indexed tx hydration candidate failed for ${accountId}: ${error.message}`);
        }
      }
    } catch (error) {
      log(`  Indexed account activity failed for ${accountId}: ${error.message}`);
    }
  }

  return null;
}

async function discoverRawTransactionContext(networkUrl, fullBlock, options = {}) {
  const log = createLogger(options.log);
  let txHash = null;
  let senderId = null;
  let receiverId = null;
  let receiptId = null;
  let finalExecutionStatus = null;
  let currentBlock = fullBlock;
  const deadline = Date.now() + RAW_TX_SEARCH_TIME_BUDGET_MS;

  for (let attempt = 0; currentBlock && attempt < RAW_TX_SEARCH_BLOCK_LIMIT && !txHash; attempt++) {
    if (Date.now() > deadline) {
      log(`  Raw RPC tx search timed out after ${attempt} block(s)`);
      break;
    }

    const usableChunks = (currentBlock?.chunks || [])
      .filter((chunk) => chunk?.chunk_hash && chunk.chunk_hash !== EMPTY_CHUNK_HASH);
    const chunkResults = await Promise.allSettled(
      usableChunks.map((chunk) => sendRpc(networkUrl, 'chunk', { chunk_id: chunk.chunk_hash }))
    );

    for (const result of chunkResults) {
      if (result.status !== 'fulfilled' || !Array.isArray(result.value?.transactions)) {
        continue;
      }

      const firstTransaction = result.value.transactions[0];
      if (!firstTransaction?.hash || !firstTransaction?.signer_id) {
        continue;
      }

      txHash = firstTransaction.hash;
      senderId = firstTransaction.signer_id;
      receiverId = firstTransaction.receiver_id || null;
      break;
    }

    if (txHash) {
      break;
    }

    try {
      currentBlock = await sendRpc(networkUrl, 'block', { block_id: currentBlock.header.prev_hash });
    } catch {
      currentBlock = null;
    }
  }

  if (!txHash || !senderId) {
    return null;
  }

  try {
    const txResult = await sendRpc(
      networkUrl,
      'tx',
      {
        sender_account_id: senderId,
        tx_hash: txHash,
        wait_until: 'FINAL',
      },
      { id: 'discover-raw-tx' }
    );

    return {
      finalExecutionStatus: txResult?.final_execution_status || null,
      receiptId: txResult?.receipts_outcome?.[0]?.id || null,
      receiverId: txResult?.transaction?.receiver_id || receiverId || null,
      senderId: txResult?.transaction?.signer_id || senderId,
      sourceAccount: senderId,
      sourceKind: 'raw-rpc',
      txHash,
    };
  } catch (error) {
    log(`  Raw RPC tx lookup failed for ${txHash}: ${error.message}`);
    return {
      finalExecutionStatus,
      receiptId,
      receiverId,
      senderId,
      sourceAccount: senderId,
      sourceKind: 'raw-rpc',
      txHash,
    };
  }
}

async function discoverTransactionContext(networkConfig, blockContext, options = {}) {
  const indexedContext = await discoverIndexedTransactionContext(networkConfig, options);
  if (indexedContext) {
    return indexedContext;
  }

  return discoverRawTransactionContext(networkConfig.url, blockContext.fullBlock, options);
}

async function discoverRpcContext(networkKey, options = {}) {
  const networkConfig = DISCOVERY_NETWORKS[networkKey];
  if (!networkConfig) {
    throw new Error(`Unknown network: ${networkKey}`);
  }

  const log = createLogger(options.log);
  const blockContext = await fetchLatestBlockContext(networkConfig.url, { log });
  const transactionContext = await discoverTransactionContext(
    networkConfig,
    blockContext,
    {
      account: options.account,
      limit: options.limit,
      log,
    }
  );

  let publicKey = null;
  try {
    publicKey = await fetchPublicKey(networkConfig.url, networkConfig.publicKeyAccount);
  } catch (error) {
    log(`  Public key lookup failed for ${networkConfig.publicKeyAccount}: ${error.message}`);
  }

  return {
    blockHash: blockContext.blockHash || null,
    blockHeight: blockContext.blockHeight || null,
    chunkHash: blockContext.chunkHash || null,
    epochId: blockContext.epochId || null,
    finalExecutionStatus: transactionContext?.finalExecutionStatus || null,
    network: networkKey,
    previousBlockHash: blockContext.previousBlockHash || null,
    publicKey,
    publicKeyAccount: networkConfig.publicKeyAccount,
    receiptId: transactionContext?.receiptId || null,
    receiverId: transactionContext?.receiverId || null,
    rpcUrl: networkConfig.url,
    shardId: blockContext.shardId ?? null,
    sourceAccount: transactionContext?.sourceAccount || options.account || networkConfig.discoveryAccounts?.[0] || null,
    sourceKind: transactionContext?.sourceKind || null,
    txHash: transactionContext?.txHash || null,
    senderId: transactionContext?.senderId || null,
  };
}

async function discoverRpcContexts(options = {}) {
  const networkKeys = Array.isArray(options.networks) && options.networks.length > 0
    ? options.networks
    : Object.keys(DISCOVERY_NETWORKS);

  const result = {};
  for (const networkKey of networkKeys) {
    result[networkKey] = await discoverRpcContext(networkKey, {
      account: options.account,
      limit: options.limit,
      log: options.log,
    });
  }

  return result;
}

function buildEndpointCandidates(networkKey, context) {
  const networkConfig = DISCOVERY_NETWORKS[networkKey];

  return {
    accessKey: {
      account_id: networkConfig.publicKeyAccount,
      public_key: context.publicKey,
    },
    block: {
      block_hash: context.blockHash,
      block_height: context.blockHeight,
      latest_block: {
        finality: 'optimistic',
      },
    },
    changes: {
      account_ids: [networkConfig.changesAccount],
      changes_type: 'account_changes',
      finality: 'final',
    },
    chunk: {
      block_id: context.blockHash,
      chunk_id: context.chunkHash,
      shard_id: context.shardId,
    },
    congestion: {
      block_id: context.blockHash,
      chunk_id: context.chunkHash,
      shard_id: context.shardId,
    },
    lightClientBlockProof: {
      block_hash: context.previousBlockHash || context.blockHash,
      light_client_head: context.blockHash,
    },
    lightClientProof: {
      light_client_head: context.blockHash,
      sender_id: context.senderId,
      transaction_hash: context.txHash,
      type: 'transaction',
    },
    nextLightClientBlock: {
      last_block_hash: context.blockHash,
    },
    protocolConfig: {
      finality: 'final',
    },
    transaction: {
      receipt_id: context.receiptId,
      sender_account_id: context.senderId,
      tx_hash: context.txHash,
      wait_until: 'FINAL',
    },
    validators: {
      block_id: context.blockHeight,
      epoch_id: context.epochId,
    },
  };
}

module.exports = {
  DISCOVERY_NETWORKS,
  buildEndpointCandidates,
  discoverRpcContext,
  discoverRpcContexts,
  fetchLatestBlockContext,
  fetchPublicKey,
  fetchStatus,
  hydrateIndexedTransactions,
  sendRpc,
};
