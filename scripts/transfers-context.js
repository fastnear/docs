const TRANSFERS_NETWORKS = {
  mainnet: 'https://transfers.main.fastnear.com',
};

const TRANSFERS_DISCOVERY_ACCOUNTS = {
  mainnet: 'root.near',
};

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

function getTransfersDiscoveryAccount(networkKey) {
  return TRANSFERS_DISCOVERY_ACCOUNTS[networkKey] || TRANSFERS_DISCOVERY_ACCOUNTS.mainnet;
}

function getTransfersRuntimeFields(pageModelId, context) {
  if (!context || pageModelId !== 'transfers-v0-transfers') {
    return {};
  }

  return {
    account_id: context.sourceAccount,
  };
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

async function discoverTransfersContext(networkKey, options = {}) {
  const baseUrl = TRANSFERS_NETWORKS[networkKey];
  if (!baseUrl) {
    throw new Error(`Unknown Transfers network: ${networkKey}`);
  }

  const signal = options.signal;
  const sourceAccount = options.account || getTransfersDiscoveryAccount(networkKey);
  const payload = await postJson(
    baseUrl,
    '/v0/transfers',
    {
      account_id: sourceAccount,
      desc: true,
      limit: options.limit || 5,
    },
    signal
  );
  const transfers = Array.isArray(payload?.transfers) ? payload.transfers : [];
  const latestTransfer = transfers[0] || null;

  return {
    baseUrl,
    latestTransfer,
    network: networkKey,
    resumeToken: payload?.resume_token || null,
    sourceAccount,
  };
}

module.exports = {
  TRANSFERS_DISCOVERY_ACCOUNTS,
  TRANSFERS_NETWORKS,
  discoverTransfersContext,
  getTransfersDiscoveryAccount,
  getTransfersRuntimeFields,
  normalizeBaseUrl,
};
