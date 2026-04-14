#!/usr/bin/env node

const {
  buildCurlCommand,
  buildHttpRequestBody,
  buildHttpRequestUrl,
  loadPageModels,
} = require('./http-audit-utils');
const {
  discoverFastnearContext,
  getFastnearRuntimeFields,
} = require('./fastnear-context');

function loadFastnearPageModels() {
  return loadPageModels('/apis/fastnear/');
}

function isFastnearPayloadValid(pageModelId, payload) {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  switch (pageModelId) {
    case 'fastnear-system-health':
      return typeof payload.status === 'string';
    case 'fastnear-system-status':
      return typeof payload.version === 'string';
    case 'fastnear-v0-public-key-lookup':
    case 'fastnear-v0-public-key-lookup-all':
    case 'fastnear-v1-public-key-lookup':
    case 'fastnear-v1-public-key-lookup-all':
      return typeof payload.public_key === 'string' && Array.isArray(payload.account_ids);
    case 'fastnear-v1-ft-top':
      return typeof payload.token_id === 'string' && Array.isArray(payload.accounts);
    default:
      return typeof payload.account_id === 'string';
  }
}

async function runAuditCase(pageModel, network, contextsByNetwork) {
  const fieldValues = {
    ...(network.defaultFields || {}),
    ...getFastnearRuntimeFields(pageModel.pageModelId, contextsByNetwork[network.key]),
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

  if (!isFastnearPayloadValid(pageModel.pageModelId, payload)) {
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
  const pageModels = loadFastnearPageModels();
  const contexts = await Promise.all(
    [...new Set(pageModels.flatMap((pageModel) => pageModel.interaction.networks.map((network) => network.key)))]
      .map((networkKey) => discoverFastnearContext(networkKey))
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
