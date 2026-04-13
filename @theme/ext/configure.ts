/* eslint-disable no-restricted-globals */

import { DOCS_ENHANCEMENTS } from "./generatedEnhancements";
import { AGGREGATE_OPERATION_ROUTE_TO_CANONICAL } from "./generatedOperationRoutes";
import { getPortalAuth } from "./browserAuth";

type RequestValues = {
  headers?: Record<string, string>;
  query?: Record<string, string>;
  path?: Record<string, string>;
  envVariables?: Record<string, string>;
  body?: any;
  security?: {
    token?: {
      access_token: string;
      token_type?: string;
    };
  };
};

type EnhancementScalar = string | number | boolean;

type EnhancementScopedValue =
  | EnhancementScalar
  | Record<string, EnhancementScalar | undefined>;

type EnhancementPreset = {
  headers?: Record<string, EnhancementScopedValue>;
  query?: Record<string, EnhancementScopedValue>;
  path?: Record<string, EnhancementScopedValue>;
  body?: any;
  bodyByNetwork?: Record<string, any>;
  server?: EnhancementScopedValue;
};

type EnhancementOperation = {
  defaults?: {
    preset?: string;
    network?: string;
  };
  presets?: Record<string, EnhancementPreset>;
};

type EnhancementManifest = {
  service?: string;
  pathPrefix?: string;
  operations?: Record<string, EnhancementOperation>;
};

type ServiceId =
  | "rpc"
  | "fastnear"
  | "neardata"
  | "kv-fastdata"
  | "transactions"
  | "transfers";

type ServiceCapabilities = {
  supportsApiKey: boolean;
  supportsBearer: boolean;
  supportsServerRequestValues: boolean;
};

const RPC_PATH_PREFIX = "/rpcs/";
const API_PATH_PREFIXES: Array<[Exclude<ServiceId, "rpc">, string]> = [
  ["fastnear", "/apis/fastnear/"],
  ["neardata", "/apis/neardata/"],
  ["kv-fastdata", "/apis/kv-fastdata/"],
  ["transactions", "/apis/transactions/"],
  ["transfers", "/apis/transfers/"],
];

const SERVICE_CAPABILITIES: Record<ServiceId, ServiceCapabilities> = {
  rpc: {
    supportsApiKey: true,
    supportsBearer: true,
    supportsServerRequestValues: true,
  },
  fastnear: {
    supportsApiKey: true,
    supportsBearer: false,
    supportsServerRequestValues: false,
  },
  neardata: {
    supportsApiKey: true,
    supportsBearer: false,
    supportsServerRequestValues: false,
  },
  "kv-fastdata": {
    supportsApiKey: false,
    supportsBearer: false,
    supportsServerRequestValues: false,
  },
  transactions: {
    supportsApiKey: false,
    supportsBearer: false,
    supportsServerRequestValues: false,
  },
  transfers: {
    supportsApiKey: false,
    supportsBearer: false,
    supportsServerRequestValues: false,
  },
};

const API_KEY_ENV_IDS = ["ApiKeyAuth", "fastnear_api_key"];
const BEARER_ENV_IDS = ["BearerAuth", "bearerAuth", "jwt"];
const ENHANCEMENT_MANIFESTS = DOCS_ENHANCEMENTS as Record<string, EnhancementManifest>;

type PageContext = {
  service: ServiceId | null;
  capabilities: ServiceCapabilities | null;
  pathname: string;
  canonicalPathname: string;
};

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

function parseJsonParam(search: URLSearchParams, key: string) {
  const value = search.get(key);
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    if (typeof window !== "undefined" && window.location.hostname === "localhost") {
      console.warn(`[configure.ts] Failed to parse ?${key}= JSON`, error);
    }
    return undefined;
  }
}

function cloneJsonValue<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function getSearchOverrides(search: URLSearchParams, prefix: string) {
  const values: Record<string, string> = {};

  for (const [key, value] of search.entries()) {
    if (key.startsWith(prefix)) {
      values[key.slice(prefix.length)] = value;
    }
  }

  return values;
}

function resolveScopedValue(value: EnhancementScopedValue | undefined, network?: string) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (network && value[network] !== undefined) {
    return String(value[network]);
  }

  if (value.default !== undefined) {
    return String(value.default);
  }

  return undefined;
}

function resolveScopedRecord(
  values: Record<string, EnhancementScopedValue> | undefined,
  network?: string
) {
  const resolved: Record<string, string> = {};

  for (const [key, value] of Object.entries(values || {})) {
    const finalValue = resolveScopedValue(value, network);
    if (finalValue !== undefined) {
      resolved[key] = finalValue;
    }
  }

  return resolved;
}

function getEnhancementOperation(pathname: string) {
  for (const manifest of Object.values(ENHANCEMENT_MANIFESTS)) {
    const operation = manifest.operations?.[pathname];
    if (operation) {
      return operation;
    }
  }

  return undefined;
}

function getServiceForCanonicalPath(pathname: string): ServiceId | null {
  if (pathname.startsWith(RPC_PATH_PREFIX)) {
    return "rpc";
  }

  for (const [service, prefix] of API_PATH_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return service;
    }
  }

  return null;
}

function getPageContext(pathname: string): PageContext {
  const canonicalOperationPath = AGGREGATE_OPERATION_ROUTE_TO_CANONICAL[pathname];
  if (canonicalOperationPath) {
    const service = getServiceForCanonicalPath(canonicalOperationPath);
    return {
      service,
      capabilities: service ? SERVICE_CAPABILITIES[service] : null,
      pathname,
      canonicalPathname: canonicalOperationPath,
    };
  }

  const service = getServiceForCanonicalPath(pathname);
  return {
    service,
    capabilities: service ? SERVICE_CAPABILITIES[service] : null,
    pathname,
    canonicalPathname: pathname,
  };
}

function getPresetRequestValues(
  operation: EnhancementOperation | undefined,
  search: URLSearchParams
) {
  const defaults = operation?.defaults || {};
  const network = search.get("network") ?? defaults.network;
  const presetName = search.get("preset") || defaults.preset;
  const preset = presetName ? operation?.presets?.[presetName] : undefined;
  const explicitBody = parseJsonParam(search, "body");
  const body =
    explicitBody ??
    (network && preset?.bodyByNetwork?.[network] !== undefined
      ? cloneJsonValue(preset.bodyByNetwork[network])
      : cloneJsonValue(preset?.body));
  const selectedServer = search.get("server") || resolveScopedValue(preset?.server, network);

  return {
    network,
    presetName,
    selectedServer,
    values: {
      headers: {
        ...resolveScopedRecord(preset?.headers, network),
        ...getSearchOverrides(search, "header."),
      },
      query: {
        ...resolveScopedRecord(preset?.query, network),
        ...getSearchOverrides(search, "query."),
      },
      path: {
        ...resolveScopedRecord(preset?.path, network),
        ...getSearchOverrides(search, "path."),
      },
      body,
    },
  };
}

export function configure(context: any) {
  const search =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const pageContext = getPageContext(pathname);
  const enhancementOperation = getEnhancementOperation(pageContext.canonicalPathname);
  const presetRequestValues = getPresetRequestValues(enhancementOperation, search);

  const { apiKey, bearer } = getPortalAuth(search);

  const rv: RequestValues = {
    headers: { ...presetRequestValues.values.headers },
    query: { ...presetRequestValues.values.query },
    path: { ...presetRequestValues.values.path },
    envVariables: {},
    body: presetRequestValues.values.body,
  };
  const capabilities = pageContext.capabilities;

  if (apiKey && capabilities?.supportsApiKey) {
    rv.query!["apiKey"] = apiKey;
    if (pageContext.service === "rpc") {
      rv.headers!["x-api-key"] = apiKey;
    }
    rv.envVariables!.API_KEY = apiKey;
    for (const id of API_KEY_ENV_IDS) {
      rv.envVariables![id] = apiKey;
    }
  }

  if (bearer && capabilities?.supportsBearer) {
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

  if (presetRequestValues.network) {
    rv.envVariables!.NETWORK = presetRequestValues.network;
  }

  if (presetRequestValues.presetName) {
    rv.envVariables!.DOCS_PRESET = presetRequestValues.presetName;
  }

  if (presetRequestValues.selectedServer) {
    rv.envVariables!.SERVER_URL = presetRequestValues.selectedServer;
  }

  // Build per-server config: Redocly applies the matching config when the
  // user switches servers — no DOM manipulation needed for envVariables.
  const serverRequestValues: Record<string, RequestValues> = {};
  if (capabilities?.supportsServerRequestValues) {
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
      service: pageContext.service,
      pathname,
      canonicalPathname: pageContext.canonicalPathname,
      supportsApiKey: capabilities?.supportsApiKey ?? false,
      supportsBearer: capabilities?.supportsBearer ?? false,
      supportsServerRequestValues: capabilities?.supportsServerRequestValues ?? false,
      hasApiKey: !!apiKey,
      hasBearer: !!bearer,
      preset: presetRequestValues.presetName,
      network: presetRequestValues.network,
      selectedServer: presetRequestValues.selectedServer,
      hasBodyOverride: rv.body !== undefined,
      serverCount: Object.keys(serverRequestValues).length,
    });
  }

  if (Object.keys(serverRequestValues).length > 0) {
    return { requestValues: rv, serverRequestValues };
  }

  return { requestValues: rv };
}
