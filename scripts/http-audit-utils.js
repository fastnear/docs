const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PAGE_MODELS_PATH = path.join(ROOT, 'shared/generatedFastnearPageModels.json');

function loadPageModels(pathPrefix) {
  const pageModels = JSON.parse(fs.readFileSync(PAGE_MODELS_PATH, 'utf8'));
  return pageModels
    .filter((pageModel) => pageModel.canonicalPath.startsWith(pathPrefix))
    .sort((left, right) => left.canonicalPath.localeCompare(right.canonicalPath));
}

function valueIsPresent(value) {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}

function buildHttpRequestUrl(pageModel, network, fieldValues) {
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
    if (valueIsPresent(value)) {
      requestUrl.searchParams.set(field.name, String(value).trim());
    }
  }

  return requestUrl.toString();
}

function buildHttpRequestBody(pageModel, fieldValues) {
  const bodyEntries = pageModel.interaction.fields
    .filter((field) => field.location === 'body')
    .map((field) => [field.name, fieldValues[field.name]])
    .filter(([, value]) => valueIsPresent(value));

  if (bodyEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(bodyEntries);
}

function buildCurlCommand(url, body) {
  if (body === undefined) {
    return `curl -sS -L "${url}"`;
  }

  return `curl -sS "${url}" -H 'content-type: application/json' --data '${JSON.stringify(body)}'`;
}

module.exports = {
  buildCurlCommand,
  buildHttpRequestBody,
  buildHttpRequestUrl,
  loadPageModels,
  valueIsPresent,
};
