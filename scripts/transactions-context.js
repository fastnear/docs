const TRANSACTIONS_NETWORKS = {
  mainnet: 'https://tx.main.fastnear.com',
  testnet: 'https://tx.test.fastnear.com',
};

const TRANSACTIONS_DISCOVERY_ACCOUNTS = {
  mainnet: 'intents.near',
  testnet: 'root.testnet',
};

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

function getTransactionsDiscoveryAccount(networkKey) {
  return TRANSACTIONS_DISCOVERY_ACCOUNTS[networkKey] || TRANSACTIONS_DISCOVERY_ACCOUNTS.mainnet;
}

function getTransactionsRuntimeFields(pageModelId, context) {
  if (!context) {
    return {};
  }

  switch (pageModelId) {
    case 'transactions-v0-account':
      return {
        account_id: context.sourceAccount,
      };
    case 'transactions-v0-block':
      return {
        block_id: context.latestBlockHeight,
      };
    case 'transactions-v0-blocks':
      return {
        from_block_height: context.rangeStart,
        to_block_height: context.latestBlockHeight,
      };
    case 'transactions-v0-receipt':
      return context.recentReceiptId
        ? {
            receipt_id: context.recentReceiptId,
          }
        : {};
    case 'transactions-v0-transactions':
      return context.recentTxHashes.length > 0
        ? {
            tx_hashes: context.recentTxHashes,
          }
        : {};
    default:
      return {};
  }
}

async function postJson(baseUrl, path, body, signal) {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
    body: JSON.stringify(body),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    method: 'POST',
    signal,
  });

  if (!response.ok) {
    return null;
  }

  return await response.json();
}

function extractReceiptId(transaction) {
  if (typeof transaction?.execution_outcome?.outcome?.status?.SuccessReceiptId === 'string') {
    return transaction.execution_outcome.outcome.status.SuccessReceiptId;
  }

  const outcomeReceiptId = transaction?.execution_outcome?.outcome?.receipt_ids?.find(
    (receiptId) => typeof receiptId === 'string'
  );
  if (outcomeReceiptId) {
    return outcomeReceiptId;
  }

  const nestedReceiptId = transaction?.receipts?.find(
    (receiptEntry) => typeof receiptEntry?.receipt?.receipt_id === 'string'
  )?.receipt?.receipt_id;
  if (nestedReceiptId) {
    return nestedReceiptId;
  }

  return null;
}

async function discoverTransactionsContext(networkKey, options = {}) {
  const baseUrl = TRANSACTIONS_NETWORKS[networkKey];
  if (!baseUrl) {
    throw new Error(`Unknown Transactions network: ${networkKey}`);
  }

  const signal = options.signal;
  const sourceAccount = options.account || getTransactionsDiscoveryAccount(networkKey);
  const accountPayload = await postJson(
    baseUrl,
    '/v0/account',
    {
      account_id: sourceAccount,
      desc: true,
      is_real_signer: true,
      is_success: true,
      limit: options.limit || 5,
    },
    signal
  );

  const recentRows = Array.isArray(accountPayload?.account_txs)
    ? accountPayload.account_txs.filter(
        (row) =>
          typeof row?.transaction_hash === 'string' &&
          Number.isFinite(Number(row?.tx_block_height))
      )
    : [];

  if (recentRows.length === 0) {
    return {
      baseUrl,
      latestBlockHeight: null,
      network: networkKey,
      rangeStart: null,
      recentReceiptId: null,
      recentTxHashes: [],
      sourceAccount,
    };
  }

  const latestBlockHeight = Math.max(...recentRows.map((row) => Number(row.tx_block_height)));
  const recentTxHashes = [...new Set(recentRows.map((row) => row.transaction_hash))].slice(0, 2);
  const rangeStart = Math.max(0, latestBlockHeight - 9);
  let recentReceiptId = null;

  if (recentTxHashes.length > 0) {
    const transactionPayload = await postJson(
      baseUrl,
      '/v0/transactions',
      { tx_hashes: recentTxHashes },
      signal
    );
    const transactions = Array.isArray(transactionPayload?.transactions)
      ? transactionPayload.transactions
      : [];
    recentReceiptId =
      transactions.map((transaction) => extractReceiptId(transaction)).find(Boolean) || null;
  }

  return {
    baseUrl,
    latestBlockHeight,
    network: networkKey,
    rangeStart,
    recentReceiptId,
    recentTxHashes,
    sourceAccount,
  };
}

module.exports = {
  TRANSACTIONS_DISCOVERY_ACCOUNTS,
  TRANSACTIONS_NETWORKS,
  discoverTransactionsContext,
  getTransactionsDiscoveryAccount,
  getTransactionsRuntimeFields,
  normalizeBaseUrl,
};
