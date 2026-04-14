const FASTNEAR_NETWORKS = {
  mainnet: 'https://api.fastnear.com',
  testnet: 'https://test.api.fastnear.com',
};

const FASTNEAR_RPC_NETWORKS = {
  mainnet: 'https://rpc.mainnet.fastnear.com',
  testnet: 'https://rpc.testnet.fastnear.com',
};

const FASTNEAR_DISCOVERY_ACCOUNTS = {
  mainnet: 'root.near',
  testnet: 'root.testnet',
};

const FASTNEAR_DISCOVERY_TOKEN_IDS = {
  mainnet: 'wrap.near',
  testnet: 'wrap.testnet',
};

const FASTNEAR_FALLBACK_PUBLIC_KEYS = {
  mainnet: 'ed25519:CCaThr3uokqnUs6Z5vVnaDcJdrfuTpYJHJWcAGubDjT',
  testnet: 'ed25519:5FiU4tWnA2QmivpLTdHJhLeSfeZ7KuW4KKNaDqoBKue2',
};

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

function getFastnearDiscoveryAccount(networkKey) {
  return FASTNEAR_DISCOVERY_ACCOUNTS[networkKey] || FASTNEAR_DISCOVERY_ACCOUNTS.mainnet;
}

function getFastnearDiscoveryTokenId(networkKey) {
  return FASTNEAR_DISCOVERY_TOKEN_IDS[networkKey] || FASTNEAR_DISCOVERY_TOKEN_IDS.mainnet;
}

async function fetchJson(url, signal) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    return null;
  }

  return await response.json();
}

async function callRpc(rpcUrl, method, params, signal) {
  const response = await fetch(normalizeBaseUrl(rpcUrl), {
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'fastnear-docs',
      method,
      params,
    }),
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

  const payload = await response.json();
  if (payload?.error) {
    return null;
  }

  return payload?.result || null;
}

async function lookupPublicKeyAccountIds(baseUrl, publicKey, signal) {
  const payload = await fetchJson(
    `${normalizeBaseUrl(baseUrl)}/v1/public_key/${encodeURIComponent(publicKey)}/all`,
    signal
  );

  return Array.isArray(payload?.account_ids) ? payload.account_ids : [];
}

async function discoverFastnearPublicKey(baseUrl, rpcUrl, accountId, networkKey, signal) {
  const accessKeyList = await callRpc(
    rpcUrl,
    'query',
    {
      request_type: 'view_access_key_list',
      finality: 'final',
      account_id: accountId,
    },
    signal
  );

  const publicKeys = Array.isArray(accessKeyList?.keys)
    ? accessKeyList.keys
        .map((row) => row?.public_key)
        .filter((publicKey) => typeof publicKey === 'string')
    : [];

  for (const publicKey of publicKeys.slice(0, 12)) {
    const accountIds = await lookupPublicKeyAccountIds(baseUrl, publicKey, signal);
    if (accountIds.includes(accountId)) {
      return {
        publicKey,
        publicKeyAccountIds: accountIds,
      };
    }
  }

  const fallbackPublicKey =
    publicKeys[0] || FASTNEAR_FALLBACK_PUBLIC_KEYS[networkKey] || FASTNEAR_FALLBACK_PUBLIC_KEYS.mainnet;
  const fallbackAccountIds = fallbackPublicKey
    ? await lookupPublicKeyAccountIds(baseUrl, fallbackPublicKey, signal)
    : [];

  return {
    publicKey: fallbackPublicKey,
    publicKeyAccountIds: fallbackAccountIds,
  };
}

function getFastnearRuntimeFields(pageModelId, context) {
  if (!context) {
    return {};
  }

  switch (pageModelId) {
    case 'fastnear-v0-account-staking':
    case 'fastnear-v0-account-ft':
    case 'fastnear-v0-account-nft':
    case 'fastnear-v1-account-staking':
    case 'fastnear-v1-account-ft':
    case 'fastnear-v1-account-nft':
    case 'fastnear-v1-account-full':
      return {
        account_id: context.sourceAccount,
      };
    case 'fastnear-v0-public-key-lookup':
    case 'fastnear-v0-public-key-lookup-all':
    case 'fastnear-v1-public-key-lookup':
    case 'fastnear-v1-public-key-lookup-all':
      return context.publicKey
        ? {
            public_key: context.publicKey,
          }
        : {};
    case 'fastnear-v1-ft-top':
      return {
        token_id: context.tokenId,
      };
    default:
      return {};
  }
}

async function discoverFastnearContext(networkKey, options = {}) {
  const baseUrl = FASTNEAR_NETWORKS[networkKey];
  const rpcUrl = FASTNEAR_RPC_NETWORKS[networkKey];
  if (!baseUrl || !rpcUrl) {
    throw new Error(`Unknown FastNEAR network: ${networkKey}`);
  }

  const signal = options.signal;
  const sourceAccount = options.account || getFastnearDiscoveryAccount(networkKey);
  const tokenId = options.tokenId || getFastnearDiscoveryTokenId(networkKey);
  const accountPayload = await fetchJson(
    `${normalizeBaseUrl(baseUrl)}/v1/account/${encodeURIComponent(sourceAccount)}/full`,
    signal
  );
  const tokenPayload = await fetchJson(
    `${normalizeBaseUrl(baseUrl)}/v1/ft/${encodeURIComponent(tokenId)}/top`,
    signal
  );
  const publicKeyContext = await discoverFastnearPublicKey(
    baseUrl,
    rpcUrl,
    sourceAccount,
    networkKey,
    signal
  );

  return {
    baseUrl,
    network: networkKey,
    publicKey: publicKeyContext.publicKey,
    publicKeyAccountIds: publicKeyContext.publicKeyAccountIds,
    rpcUrl,
    sourceAccount: accountPayload?.account_id || sourceAccount,
    tokenId: tokenPayload?.token_id || tokenId,
  };
}

module.exports = {
  FASTNEAR_DISCOVERY_ACCOUNTS,
  FASTNEAR_DISCOVERY_TOKEN_IDS,
  FASTNEAR_FALLBACK_PUBLIC_KEYS,
  FASTNEAR_NETWORKS,
  FASTNEAR_RPC_NETWORKS,
  discoverFastnearContext,
  getFastnearDiscoveryAccount,
  getFastnearDiscoveryTokenId,
  getFastnearRuntimeFields,
  normalizeBaseUrl,
};
