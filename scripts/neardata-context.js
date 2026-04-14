const NEARDATA_NETWORKS = {
  mainnet: 'https://mainnet.neardata.xyz',
  testnet: 'https://testnet.neardata.xyz',
};

const NEARDATA_RUNTIME_PAGE_MODES = {
  'neardata-v0-block': 'final',
  'neardata-v0-block-chunk': 'final',
  'neardata-v0-block-headers': 'final',
  'neardata-v0-block-shard': 'final',
  'neardata-v0-block-optimistic': 'optimistic',
};

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

function getNeardataRuntimeMode(pageModelId) {
  return NEARDATA_RUNTIME_PAGE_MODES[pageModelId] || null;
}

function getNeardataRuntimeFields(pageModelId, context) {
  if (!context) {
    return {};
  }

  if (
    pageModelId === 'neardata-v0-block' ||
    pageModelId === 'neardata-v0-block-headers' ||
    pageModelId === 'neardata-v0-block-optimistic'
  ) {
    return {
      block_height: String(context.blockHeight),
    };
  }

  if (pageModelId === 'neardata-v0-block-chunk' || pageModelId === 'neardata-v0-block-shard') {
    return {
      block_height: String(context.blockHeight),
      shard_id: String(context.shardId),
    };
  }

  return {};
}

async function fetchNeardataLatestContext(baseUrl, mode = 'final', signal) {
  const normalizedUrl = normalizeBaseUrl(baseUrl);
  const endpoint =
    mode === 'optimistic'
      ? `${normalizedUrl}/v0/last_block/optimistic`
      : `${normalizedUrl}/v0/last_block/final`;

  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      redirect: 'follow',
      signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const blockHeight = Number(payload?.block?.header?.height);
    if (!Number.isFinite(blockHeight)) {
      return null;
    }

    const shardEntry = Array.isArray(payload?.shards)
      ? payload.shards.find((shard) => Number.isFinite(Number(shard?.shard_id)))
      : null;
    const shardId = Number.isFinite(Number(shardEntry?.shard_id))
      ? Number(shardEntry.shard_id)
      : 0;

    return {
      blockHeight,
      mode,
      shardId,
      sourceUrl: response.url || endpoint,
    };
  } catch {
    return null;
  }
}

async function discoverNeardataContexts(networkKey, signal) {
  const baseUrl = NEARDATA_NETWORKS[networkKey];
  if (!baseUrl) {
    throw new Error(`Unknown Near Data network: ${networkKey}`);
  }

  const [finalContext, optimisticContext] = await Promise.all([
    fetchNeardataLatestContext(baseUrl, 'final', signal),
    fetchNeardataLatestContext(baseUrl, 'optimistic', signal),
  ]);

  return {
    baseUrl,
    final: finalContext,
    network: networkKey,
    optimistic: optimisticContext,
  };
}

module.exports = {
  NEARDATA_NETWORKS,
  NEARDATA_RUNTIME_PAGE_MODES,
  discoverNeardataContexts,
  fetchNeardataLatestContext,
  getNeardataRuntimeFields,
  getNeardataRuntimeMode,
  normalizeBaseUrl,
};
