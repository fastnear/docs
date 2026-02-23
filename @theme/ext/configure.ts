/* eslint-disable no-restricted-globals */

type RequestValues = {
  headers?: Record<string, string>;
  query?: Record<string, string>;
  security?: Record<string, any>;
  envVariables?: Record<string, string>;
  body?: any;
};

// Security scheme IDs that might be in your OpenAPI spec
const API_KEY_SCHEMES = ["ApiKeyAuth", "api_key", "api_keys", "fastnear_api_key"];
const BEARER_SCHEMES = ["bearerAuth", "jwt", "BearerAuth"];

/**
 * All server URLs used across per-operation and aggregate specs.
 * Listed without trailing slashes; we map both variants for robustness
 * since some YAML files use trailing slashes and some don't.
 */
const SERVER_URLS = [
  'https://rpc.mainnet.fastnear.com',
  'https://rpc.testnet.fastnear.com',
  'https://archival-rpc.mainnet.fastnear.com',
  'https://archival-rpc.testnet.fastnear.com',
];

export function configure(context: any) {
  const search =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();

  // Read API key from URL or localStorage
  // Priority: URL param > localStorage (new format) > localStorage (legacy)
  const apiKey =
    search.get("apiKey") ||
    (typeof window !== "undefined" ? window.localStorage.getItem("fastnear:apiKey") : null) ||
    (typeof window !== "undefined" ? window.localStorage.getItem("fastnear_api_key") : null) ||
    undefined;

  // Read bearer token from URL or localStorage
  const bearer =
    search.get("token") ||
    (typeof window !== "undefined" ? window.localStorage.getItem("fastnear:bearer") : null) ||
    undefined;

  const rv: RequestValues = {
    headers: {},
    query: {},
    security: {},
    envVariables: {},
  };

  if (apiKey) {
    rv.query!["apiKey"] = apiKey;
    rv.headers!["x-api-key"] = apiKey;
    for (const id of API_KEY_SCHEMES) {
      rv.security![id] = apiKey;
    }
    rv.envVariables!.API_KEY = apiKey;
    console.log('FastNEAR API key configured for Try-It console');
  }

  if (bearer) {
    rv.headers!["Authorization"] = `Bearer ${bearer}`;
    for (const id of BEARER_SCHEMES) {
      rv.security![id] = bearer;
    }
    rv.envVariables!.ACCESS_TOKEN = bearer;
  }

  // Build per-server config: Redocly applies the matching config when the
  // user switches servers — no DOM manipulation needed for envVariables.
  const serverRequestValues: Record<string, RequestValues> = {};
  for (const url of SERVER_URLS) {
    const config: RequestValues = {
      envVariables: { SERVER_URL: url },
    };
    serverRequestValues[url] = config;
    serverRequestValues[url + '/'] = config; // match trailing-slash variants
  }

  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    console.log('[configure.ts] configure()', {
      hasApiKey: !!apiKey,
      hasBearer: !!bearer,
      serverCount: Object.keys(serverRequestValues).length,
    });
  }

  return { requestValues: rv, serverRequestValues };
}
