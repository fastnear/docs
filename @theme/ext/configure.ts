/* eslint-disable no-restricted-globals */

type RequestValues = {
  headers?: Record<string, string>;
  query?: Record<string, string>;
  envVariables?: Record<string, string>;
  body?: any;
  security?: {
    token?: {
      access_token: string;
      token_type?: string;
    };
  };
};

const RPC_PATH_PREFIX = "/rpcs/";
const NEARDATA_PATH_PREFIX = "/apis/neardata/";
const API_KEY_ENV_IDS = ["ApiKeyAuth", "fastnear_api_key"];
const BEARER_ENV_IDS = ["BearerAuth", "bearerAuth", "jwt"];

/**
 * All RPC server URLs used across per-operation and aggregate specs.
 * Listed without trailing slashes; we map both variants for robustness.
 */
const SERVER_URLS = [
  "https://rpc.mainnet.fastnear.com",
  "https://rpc.testnet.fastnear.com",
  "https://archival-rpc.mainnet.fastnear.com",
  "https://archival-rpc.testnet.fastnear.com",
];

export function configure(context: any) {
  const search =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const isRpcPage = pathname.startsWith(RPC_PATH_PREFIX);
  const isNeardataPage = pathname.startsWith(NEARDATA_PATH_PREFIX);

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
    envVariables: {},
  };

  if (apiKey && (isRpcPage || isNeardataPage)) {
    rv.query!["apiKey"] = apiKey;
    if (isRpcPage) {
      rv.headers!["x-api-key"] = apiKey;
    }
    rv.envVariables!.API_KEY = apiKey;
    for (const id of API_KEY_ENV_IDS) {
      rv.envVariables![id] = apiKey;
    }
  }

  if (bearer && isRpcPage) {
    rv.headers!["Authorization"] = `Bearer ${bearer}`;
    rv.envVariables!.ACCESS_TOKEN = bearer;
    rv.security = {
      token: {
        access_token: bearer,
        token_type: "Bearer",
      },
    };
    for (const id of BEARER_ENV_IDS) {
      rv.envVariables![`${id}_token`] = bearer;
    }
  }

  // Build per-server config: Redocly applies the matching config when the
  // user switches servers — no DOM manipulation needed for envVariables.
  const serverRequestValues: Record<string, RequestValues> = {};
  if (isRpcPage) {
    for (const url of SERVER_URLS) {
      const config: RequestValues = {
        envVariables: { SERVER_URL: url },
      };
      serverRequestValues[url] = config;
      serverRequestValues[url + "/"] = config;
    }
  }

  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    console.log("[configure.ts] configure()", {
      pathname,
      isRpcPage,
      isNeardataPage,
      hasApiKey: !!apiKey,
      hasBearer: !!bearer,
      serverCount: Object.keys(serverRequestValues).length,
    });
  }

  if (Object.keys(serverRequestValues).length > 0) {
    return { requestValues: rv, serverRequestValues };
  }

  return { requestValues: rv };
}
