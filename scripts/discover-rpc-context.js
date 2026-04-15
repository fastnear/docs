#!/usr/bin/env node

/**
 * Discover fresh RPC example context from live RPC and indexed activity.
 *
 * Usage:
 *   node scripts/discover-rpc-context.js --network mainnet --json
 *   node scripts/discover-rpc-context.js --account intents.near --limit 5
 */

const {
  buildEndpointCandidates,
  discoverRpcContext,
  discoverRpcContexts,
} = require('./rpc-example-context');

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    account: null,
    json: false,
    limit: 10,
    network: 'mainnet',
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--account') {
      options.account = args[++index] || null;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--limit') {
      options.limit = Number(args[++index] || 10);
    } else if (arg === '--network') {
      options.network = args[++index] || 'mainnet';
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.limit) || options.limit <= 0) {
    throw new Error('--limit must be a positive number');
  }

  return options;
}

function formatSingleNetworkOutput(networkKey, context) {
  return {
    candidates: buildEndpointCandidates(networkKey, context),
    context,
    network: networkKey,
  };
}

async function main() {
  const options = parseArgs(process.argv);

  const log = options.json
    ? null
    : (message) => console.warn(message);

  let output;
  if (options.network === 'all') {
    const contexts = await discoverRpcContexts({
      account: options.account,
      limit: options.limit,
      log,
    });
    output = Object.fromEntries(
      Object.entries(contexts).map(([networkKey, context]) => [
        networkKey,
        formatSingleNetworkOutput(networkKey, context),
      ])
    );
  } else {
    const context = await discoverRpcContext(options.network, {
      account: options.account,
      limit: options.limit,
      log,
    });
    output = formatSingleNetworkOutput(options.network, context);
  }

  if (options.json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
