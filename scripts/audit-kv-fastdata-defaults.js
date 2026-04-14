#!/usr/bin/env node

const {
  buildCurlCommand,
  buildHttpRequestBody,
  buildHttpRequestUrl,
  loadPageModels,
} = require('./http-audit-utils');
const {
  discoverKvFastdataContext,
  getKvFastdataRuntimeFields,
} = require('./kv-fastdata-context');

function loadKvFastdataPageModels() {
  return loadPageModels('/apis/kv-fastdata/');
}

async function runAuditCase(pageModel, network, contextsByNetwork) {
  const fieldValues = {
    ...(network.defaultFields || {}),
    ...getKvFastdataRuntimeFields(pageModel.pageModelId, contextsByNetwork[network.key]),
  };
  const requestUrl = buildHttpRequestUrl(pageModel, network, fieldValues);
  const requestBody = buildHttpRequestBody(pageModel, fieldValues);
  const curlCommand = buildCurlCommand(requestUrl, requestBody);

  let response;
  try {
    response = await fetch(requestUrl, {
      body: requestBody ? JSON.stringify(requestBody) : undefined,
      headers: {
        Accept: 'application/json',
        ...(requestBody ? { 'Content-Type': 'application/json' } : {}),
      },
      method: requestBody ? 'POST' : 'GET',
      redirect: 'follow',
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

  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.entries)) {
    return {
      curlCommand,
      message: 'Unexpected response shape',
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
  const pageModels = loadKvFastdataPageModels();
  const contexts = await Promise.all(
    [...new Set(pageModels.flatMap((pageModel) => pageModel.interaction.networks.map((network) => network.key)))]
      .map((networkKey) => discoverKvFastdataContext(networkKey))
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
