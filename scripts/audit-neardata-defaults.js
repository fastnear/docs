#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  discoverNeardataContexts,
  getNeardataRuntimeFields,
  getNeardataRuntimeMode,
} = require('./neardata-context');

const ROOT = path.resolve(__dirname, '..');
const PAGE_MODELS_PATH = path.join(ROOT, 'shared/generatedFastnearPageModels.json');

function loadNeardataPageModels() {
  const pageModels = JSON.parse(fs.readFileSync(PAGE_MODELS_PATH, 'utf8'));
  return pageModels
    .filter((pageModel) => pageModel.canonicalPath.startsWith('/apis/neardata/'))
    .sort((left, right) => left.canonicalPath.localeCompare(right.canonicalPath));
}

function buildRequestUrl(pageModel, network, fieldValues) {
  const resolvedPath = pageModel.interaction.fields.reduce((currentPath, field) => {
    if (field.location !== 'path') {
      return currentPath;
    }

    const value = fieldValues[field.name];
    return currentPath.replace(`{${field.name}}`, encodeURIComponent(String(value ?? '').trim()));
  }, pageModel.route.path);

  const requestUrl = new URL(resolvedPath, network.url);
  for (const field of pageModel.interaction.fields) {
    if (field.location !== 'query') {
      continue;
    }

    const value = fieldValues[field.name];
    if (value !== undefined && value !== null && String(value).trim()) {
      requestUrl.searchParams.set(field.name, String(value).trim());
    }
  }

  return requestUrl.toString();
}

function buildCurlCommand(url) {
  return `curl -sS -L "${url}"`;
}

function getEffectiveFieldValues(pageModel, network, contextsByNetwork) {
  const runtimeMode = getNeardataRuntimeMode(pageModel.pageModelId);
  const runtimeContext = runtimeMode ? contextsByNetwork[network.key]?.[runtimeMode] : null;
  return {
    ...(network.defaultFields || {}),
    ...getNeardataRuntimeFields(pageModel.pageModelId, runtimeContext),
  };
}

async function runAuditCase(pageModel, network, contextsByNetwork) {
  const fieldValues = getEffectiveFieldValues(pageModel, network, contextsByNetwork);
  const requestUrl = buildRequestUrl(pageModel, network, fieldValues);
  const curlCommand = buildCurlCommand(requestUrl);

  let response;
  try {
    response = await fetch(requestUrl, {
      headers: { Accept: 'application/json' },
      redirect: 'follow',
    });
  } catch (error) {
    return {
      curlCommand,
      message: error instanceof Error ? error.message : 'Request failed',
      network: network.key,
      pageModelId: pageModel.pageModelId,
      status: 'FAIL',
      url: requestUrl,
    };
  }

  if (!response.ok) {
    return {
      curlCommand,
      message: `HTTP ${response.status}`,
      network: network.key,
      pageModelId: pageModel.pageModelId,
      status: 'FAIL',
      url: requestUrl,
    };
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return {
      curlCommand,
      message: `Expected JSON response, received ${contentType || 'unknown content type'}`,
      network: network.key,
      pageModelId: pageModel.pageModelId,
      status: 'FAIL',
      url: requestUrl,
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
      url: requestUrl,
    };
  }

  if (!payload || typeof payload !== 'object') {
    return {
      curlCommand,
      message: 'Expected a non-null JSON object response',
      network: network.key,
      pageModelId: pageModel.pageModelId,
      status: 'FAIL',
      url: requestUrl,
    };
  }

  if (pageModel.pageModelId === 'neardata-system-health' && typeof payload.status !== 'string') {
    return {
      curlCommand,
      message: 'Expected a health payload with a status string',
      network: network.key,
      pageModelId: pageModel.pageModelId,
      status: 'FAIL',
      url: requestUrl,
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
  const pageModels = loadNeardataPageModels();
  const contexts = await Promise.all([
    discoverNeardataContexts('mainnet'),
    discoverNeardataContexts('testnet'),
  ]);

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
