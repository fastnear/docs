#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  discoverTransactionsContext,
  getTransactionsRuntimeFields,
} = require('./transactions-context');

const ROOT = path.resolve(__dirname, '..');
const PAGE_MODELS_PATH = path.join(ROOT, 'shared/generatedFastnearPageModels.json');

function loadTransactionsPageModels() {
  const pageModels = JSON.parse(fs.readFileSync(PAGE_MODELS_PATH, 'utf8'));
  return pageModels
    .filter((pageModel) => pageModel.canonicalPath.startsWith('/apis/transactions/'))
    .sort((left, right) => left.canonicalPath.localeCompare(right.canonicalPath));
}

function buildRequestBody(pageModel, fieldValues) {
  const bodyEntries = pageModel.interaction.fields
    .filter((field) => field.location === 'body')
    .map((field) => [field.name, fieldValues[field.name]])
    .filter(([, value]) => {
      if (value === undefined || value === null) {
        return false;
      }

      if (typeof value === 'string') {
        return value.trim().length > 0;
      }

      return true;
    });

  return Object.fromEntries(bodyEntries);
}

function buildCurlCommand(url, body) {
  return `curl -sS "${url}" -H 'content-type: application/json' --data '${JSON.stringify(body)}'`;
}

async function runAuditCase(pageModel, network, contextsByNetwork) {
  const runtimeFields = getTransactionsRuntimeFields(
    pageModel.pageModelId,
    contextsByNetwork[network.key]
  );
  const body = buildRequestBody(pageModel, {
    ...(network.defaultFields || {}),
    ...runtimeFields,
  });
  const requestUrl = `${network.url}${pageModel.route.path}`;
  const curlCommand = buildCurlCommand(requestUrl, body);

  let response;
  try {
    response = await fetch(requestUrl, {
      body: JSON.stringify(body),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
  } catch (error) {
    return {
      curlCommand,
      message: error instanceof Error ? error.message : 'Request failed',
      network: network.key,
      pageModelId: pageModel.pageModelId,
      status: 'FAIL',
    };
  }

  if (!response.ok) {
    return {
      curlCommand,
      message: `HTTP ${response.status}`,
      network: network.key,
      pageModelId: pageModel.pageModelId,
      status: 'FAIL',
    };
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    return {
      curlCommand,
      message: error instanceof Error ? error.message : 'Invalid JSON response',
      network: network.key,
      pageModelId: pageModel.pageModelId,
      status: 'FAIL',
    };
  }

  if (!payload || typeof payload !== 'object') {
    return {
      curlCommand,
      message: 'Expected a JSON object response',
      network: network.key,
      pageModelId: pageModel.pageModelId,
      status: 'FAIL',
    };
  }

  return {
    message: requestUrl,
    network: network.key,
    pageModelId: pageModel.pageModelId,
    status: 'PASS',
  };
}

async function main() {
  const pageModels = loadTransactionsPageModels();
  const contexts = await Promise.all(
    [...new Set(pageModels.flatMap((pageModel) => pageModel.interaction.networks.map((network) => network.key)))]
      .map((networkKey) => discoverTransactionsContext(networkKey))
  );
  const contextsByNetwork = Object.fromEntries(
    contexts.map((context) => [context.network, context])
  );

  const results = [];
  for (const pageModel of pageModels) {
    for (const network of pageModel.interaction.networks) {
      results.push(await runAuditCase(pageModel, network, contextsByNetwork));
    }
  }

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const prefix = `${result.status.padEnd(4)} ${result.pageModelId} (${result.network})`;
    console.log(`${prefix} - ${result.message}`);
    if (result.status === 'PASS') {
      passed++;
      continue;
    }

    failed++;
    if (result.curlCommand) {
      console.log(`  ${result.curlCommand}`);
    }
  }

  console.log();
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
