const DISCOVERY_NETWORKS = {
  mainnet: {
    changesAccount: 'root.near',
    discoveryAccounts: ['intents.near', 'near-intents.near'],
    publicKeyAccount: 'root.near',
    txIndexUrl: 'https://tx.main.fastnear.com',
    url: 'https://rpc.mainnet.fastnear.com',
  },
  testnet: {
    changesAccount: 'root.testnet',
    discoveryAccounts: ['root.testnet'],
    publicKeyAccount: 'root.testnet',
    txIndexUrl: null,
    url: 'https://rpc.testnet.fastnear.com',
  },
};

const MUTATING_RPC_METHODS = new Set([
  'broadcast_tx_async',
  'broadcast_tx_commit',
  'send_tx',
]);

const SUBSET_OPERATION_IDS = [
  'view_account',
  'block_by_height',
  'chunk_by_hash',
  'changes',
  'tx_status',
  'light_client_proof',
  'validators_by_epoch',
];

const TESTNET_GLOBAL_CONTRACT_EXAMPLES = {
  byAccountId: 'ft.globals.primitives.testnet',
  byCodeHash: '3vaopJ7aRoivvzZLngPQRBEd8VJr2zPLTxQfnRCoFgNX',
};

const METRICS_AUDIT_ENV_VAR = 'FASTNEAR_API_KEY';

const TRACKED_RPC_EXAMPLE_FOLLOWUPS = [
  {
    id: 'metrics-authenticated-audit',
    networks: ['mainnet', 'testnet'],
    operationIds: ['metrics'],
    reason: 'The live endpoint is HTTP GET /metrics and requires an API key.',
    nextStep: `Set ${METRICS_AUDIT_ENV_VAR} to validate metrics in the audit path.`,
  },
  {
    id: 'mainnet-global-contract-curation',
    networks: ['mainnet'],
    operationIds: [
      'view_global_contract_code',
      'view_global_contract_code_by_account_id',
    ],
    reason: 'No verified mainnet global-contract account/hash pair is curated yet.',
    nextStep:
      'Curate a confirmed mainnet account/hash pair and replace the placeholder mainnet examples.',
  },
  {
    id: 'mutating-transaction-validation',
    networks: ['mainnet', 'testnet'],
    operationIds: ['broadcast_tx_async', 'broadcast_tx_commit', 'send_tx'],
    reason: 'Mutating transaction submission methods are intentionally excluded from live audit.',
    nextStep:
      'Keep them out of CI and validate them with a dedicated signed-transaction harness or manual checklist.',
  },
];

const MANUAL_RPC_EXAMPLE_OVERRIDES = {
  EXPERIMENTAL_protocol_config: {
    mainnet: { finality: 'final' },
    testnet: { finality: 'final' },
  },
  changes: {
    mainnet: {
      account_ids: ['root.near'],
      changes_type: 'account_changes',
      finality: 'final',
    },
    testnet: {
      account_ids: ['root.testnet'],
      changes_type: 'account_changes',
      finality: 'final',
    },
  },
  latest_block: {
    mainnet: { finality: 'optimistic' },
    testnet: { finality: 'optimistic' },
  },
  view_code: {
    mainnet: { account_id: 'intents.near' },
    testnet: { account_id: 'guest-book.testnet' },
  },
  view_global_contract_code: {
    mainnet: {
      skipAudit: true,
      skipReason: 'No verified mainnet global contract code example is curated yet.',
    },
    testnet: { code_hash: TESTNET_GLOBAL_CONTRACT_EXAMPLES.byCodeHash },
  },
  view_global_contract_code_by_account_id: {
    mainnet: {
      skipAudit: true,
      skipReason: 'No verified mainnet global contract account example is curated yet.',
    },
    testnet: { account_id: TESTNET_GLOBAL_CONTRACT_EXAMPLES.byAccountId },
  },
};

const AUDIT_SKIPS = {};

function getManualOverride(operationId, network) {
  return MANUAL_RPC_EXAMPLE_OVERRIDES[operationId]?.[network];
}

function getAuditSkip(operationId, network) {
  const auditSkip = AUDIT_SKIPS[operationId]?.[network];
  if (auditSkip) {
    return auditSkip;
  }

  const manualOverride = getManualOverride(operationId, network);
  if (manualOverride?.skipAudit) {
    return {
      skip: true,
      reason: manualOverride.skipReason || 'Audit disabled for this example.',
    };
  }

  return null;
}

module.exports = {
  AUDIT_SKIPS,
  DISCOVERY_NETWORKS,
  METRICS_AUDIT_ENV_VAR,
  MANUAL_RPC_EXAMPLE_OVERRIDES,
  MUTATING_RPC_METHODS,
  SUBSET_OPERATION_IDS,
  TESTNET_GLOBAL_CONTRACT_EXAMPLES,
  TRACKED_RPC_EXAMPLE_FOLLOWUPS,
  getAuditSkip,
  getManualOverride,
};
