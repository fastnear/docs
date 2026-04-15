const KV_FASTDATA_NETWORKS = {
  mainnet: 'https://kv.main.fastnear.com',
  testnet: 'https://kv.test.fastnear.com',
};

const KV_FASTDATA_FALLBACK_CONTEXTS = {
  mainnet: {
    currentAccountId: 'social.near',
    historyByKeyIncludeMetadata: false,
    key: 'graph/follow/sleet.near',
    keyPrefix: 'graph/follow/',
    predecessorId: 'james.near',
  },
  testnet: {
    currentAccountId: 'kv.gork-agent.testnet',
    historyByKeyIncludeMetadata: false,
    key: 'value',
    keyPrefix: 'value',
    predecessorId: 'kv.gork-agent.testnet',
  },
};

const KV_FASTDATA_DISCOVERY_CANDIDATES = {
  mainnet: ['social.near', 'contextual.near', 'app.near'],
  testnet: ['kv.gork-agent.testnet', 'guest-book.testnet', 'root.testnet', 'social.testnet', 'jsvm.testnet', 'v1.signer-prod.testnet'],
};

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

function getKvFastdataFallbackContext(networkKey) {
  return KV_FASTDATA_FALLBACK_CONTEXTS[networkKey] || KV_FASTDATA_FALLBACK_CONTEXTS.mainnet;
}

function getKeyPrefix(key) {
  if (typeof key !== 'string' || !key.trim()) {
    return '';
  }

  const lastSlashIndex = key.lastIndexOf('/');
  if (lastSlashIndex === -1) {
    return key;
  }

  return key.slice(0, lastSlashIndex + 1);
}

function buildMissingKey(keyPrefix) {
  const normalizedPrefix = String(keyPrefix || '').trim();
  if (!normalizedPrefix) {
    return 'missing';
  }

  return `${normalizedPrefix}missing`;
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

async function getJson(url, signal) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    return null;
  }

  return await response.json();
}

async function discoverFromCurrentAccount(baseUrl, accountId, signal) {
  const latestPayload = await postJson(
    baseUrl,
    `/v0/latest/${encodeURIComponent(accountId)}`,
    { include_metadata: true, limit: 5 },
    signal
  );
  const entries = Array.isArray(latestPayload?.entries)
    ? latestPayload.entries.filter(
        (entry) =>
          entry &&
          typeof entry.current_account_id === 'string' &&
          typeof entry.predecessor_id === 'string' &&
          typeof entry.key === 'string'
      )
    : [];

  for (const entry of entries) {
    const currentAccountId = entry.current_account_id;
    const predecessorId = entry.predecessor_id;
    const key = entry.key;
    const keyPrefix = getKeyPrefix(key);

    const historyByAccount = await postJson(
      baseUrl,
      `/v0/history/${encodeURIComponent(currentAccountId)}`,
      {
        asc: false,
        include_metadata: true,
        key_prefix: keyPrefix,
        limit: 3,
      },
      signal
    );
    const historyByPredecessor = await postJson(
      baseUrl,
      `/v0/history/${encodeURIComponent(currentAccountId)}/${encodeURIComponent(predecessorId)}`,
      {
        asc: false,
        include_metadata: true,
        key_prefix: keyPrefix,
        limit: 3,
      },
      signal
    );
    const latestByPredecessor = await postJson(
      baseUrl,
      `/v0/latest/${encodeURIComponent(currentAccountId)}/${encodeURIComponent(predecessorId)}`,
      {
        include_metadata: true,
        key_prefix: keyPrefix,
        limit: 3,
      },
      signal
    );
    const historyByKey = await postJson(
      baseUrl,
      '/v0/history',
      {
        asc: false,
        key,
        limit: 3,
      },
      signal
    );
    const allByPredecessor = await postJson(
      baseUrl,
      `/v0/all/${encodeURIComponent(predecessorId)}`,
      {
        include_metadata: true,
        limit: 3,
      },
      signal
    );
    const latestExactKey = await getJson(
      `${normalizeBaseUrl(baseUrl)}/v0/latest/${encodeURIComponent(currentAccountId)}/${encodeURIComponent(predecessorId)}/${encodeURIComponent(key)}`,
      signal
    );
    const historyExactKey = await getJson(
      `${normalizeBaseUrl(baseUrl)}/v0/history/${encodeURIComponent(currentAccountId)}/${encodeURIComponent(predecessorId)}/${encodeURIComponent(key)}`,
      signal
    );

    if (
      historyByAccount &&
      historyByPredecessor &&
      latestByPredecessor &&
      historyByKey &&
      allByPredecessor &&
      latestExactKey &&
      historyExactKey
    ) {
      return {
        currentAccountId,
        hasEntries: true,
        historyByKeyIncludeMetadata: false,
        key,
        keyPrefix,
        predecessorId,
        sourceAccount: accountId,
      };
    }
  }

  return null;
}

async function discoverKvFastdataContext(networkKey, options = {}) {
  const baseUrl = KV_FASTDATA_NETWORKS[networkKey];
  if (!baseUrl) {
    throw new Error(`Unknown KV FastData network: ${networkKey}`);
  }

  const signal = options.signal;
  const candidates = options.accounts || KV_FASTDATA_DISCOVERY_CANDIDATES[networkKey] || [];

  for (const accountId of candidates) {
    const discoveredContext = await discoverFromCurrentAccount(baseUrl, accountId, signal);
    if (discoveredContext) {
      return {
        baseUrl,
        network: networkKey,
        ...discoveredContext,
      };
    }
  }

  return {
    baseUrl,
    hasEntries: false,
    network: networkKey,
    sourceAccount: candidates[0] || getKvFastdataFallbackContext(networkKey).currentAccountId,
    ...getKvFastdataFallbackContext(networkKey),
  };
}

function getKvFastdataRuntimeFields(pageModelId, context) {
  if (!context) {
    return {};
  }

  switch (pageModelId) {
    case 'kv-fastdata-v0-all-by-predecessor':
      return {
        predecessor_id: context.predecessorId,
      };
    case 'kv-fastdata-v0-history-by-key':
      return {
        include_metadata: context.historyByKeyIncludeMetadata,
        key: context.key,
      };
    case 'kv-fastdata-v0-history-by-account':
      return {
        current_account_id: context.currentAccountId,
        key_prefix: context.keyPrefix,
      };
    case 'kv-fastdata-v0-history-by-predecessor':
      return {
        current_account_id: context.currentAccountId,
        predecessor_id: context.predecessorId,
        key_prefix: context.keyPrefix,
      };
    case 'kv-fastdata-v0-get-history-key':
    case 'kv-fastdata-v0-get-latest-key':
      return {
        current_account_id: context.currentAccountId,
        key: context.key,
        predecessor_id: context.predecessorId,
      };
    case 'kv-fastdata-v0-latest-by-account':
      return {
        current_account_id: context.currentAccountId,
        key_prefix: context.keyPrefix,
      };
    case 'kv-fastdata-v0-latest-by-predecessor':
      return {
        current_account_id: context.currentAccountId,
        predecessor_id: context.predecessorId,
        key_prefix: context.keyPrefix,
      };
    case 'kv-fastdata-v0-multi':
      return {
        keys: [
          `${context.currentAccountId}/${context.predecessorId}/${context.key}`,
          `${context.currentAccountId}/${context.predecessorId}/${buildMissingKey(context.keyPrefix)}`,
        ],
      };
    default:
      return {};
  }
}

module.exports = {
  KV_FASTDATA_DISCOVERY_CANDIDATES,
  KV_FASTDATA_FALLBACK_CONTEXTS,
  KV_FASTDATA_NETWORKS,
  buildMissingKey,
  discoverKvFastdataContext,
  getKeyPrefix,
  getKvFastdataFallbackContext,
  getKvFastdataRuntimeFields,
  normalizeBaseUrl,
};
