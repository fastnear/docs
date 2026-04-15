#!/usr/bin/env node

const {
  NEARDATA_NETWORKS,
  discoverNeardataContexts,
} = require('./neardata-context');

function parseArgs(argv) {
  const args = argv.slice(2);
  let network = 'all';

  for (let index = 0; index < args.length; index++) {
    const current = args[index];
    if (current === '--network') {
      network = args[index + 1] || network;
      index++;
    }
  }

  return { network };
}

async function main() {
  const { network } = parseArgs(process.argv);
  const networkKeys =
    network === 'all' ? Object.keys(NEARDATA_NETWORKS) : [network];

  const output = [];
  for (const networkKey of networkKeys) {
    output.push(await discoverNeardataContexts(networkKey));
  }

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
