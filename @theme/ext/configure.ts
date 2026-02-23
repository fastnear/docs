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

  // One-time setup for page-level bidirectional sync between server and example
  if (typeof window !== "undefined" && !pageSyncInitialized) {
    pageSyncInitialized = true;
    setupPageSync();
  }

  return { requestValues: rv, serverRequestValues };
}

// ---------------------------------------------------------------------------
// Page-level sync: server dropdown ↔ example dropdown
// ---------------------------------------------------------------------------
// When the user picks a server, auto-switch the example (and vice versa)
// so the request body matches the selected network.

let pageSyncInitialized = false;
let isSyncing = false;

function syncServerSelector(network: string) {
  const items = document.querySelectorAll<HTMLElement>(
    '[data-component-name="Dropdown/DropdownMenuItem"]'
  );
  for (const item of items) {
    const text = item.textContent || '';
    if (text.includes(`://rpc.${network.toLowerCase()}.fastnear.com`)) {
      item.click();
      return;
    }
  }
}

function syncExampleSelector(network: string) {
  const selects = document.querySelectorAll<HTMLSelectElement>('select.dropdown-select');
  for (const select of selects) {
    for (const option of select.options) {
      const text = option.textContent || '';
      if (text.toLowerCase().includes(network.toLowerCase())) {
        if (select.value !== option.value) {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        break;
      }
    }
  }
}

function setupPageSync() {
  // Example → Server: when the user picks a named example, switch the server
  document.addEventListener('change', (e) => {
    const target = e.target as HTMLSelectElement;
    if (target.tagName !== 'SELECT' || !target.classList.contains('dropdown-select')) return;

    const selectedText = target.options[target.selectedIndex]?.textContent?.trim() || '';
    const network = /testnet/i.test(selectedText) ? 'Testnet'
                  : /mainnet/i.test(selectedText) ? 'Mainnet'
                  : null;
    if (network && !isSyncing) {
      isSyncing = true;
      requestAnimationFrame(() => {
        syncServerSelector(network);
        requestAnimationFrame(() => { isSyncing = false; });
      });
    }
  }, true);

  // Server → Example: when the user picks a server, switch the named example
  document.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest?.(
      '[data-component-name="Dropdown/DropdownMenuItem"]'
    ) as HTMLElement | null;
    if (!item) return;

    const text = item.textContent || '';
    if (!text.includes('fastnear.com')) return;

    const network = /testnet/i.test(text) ? 'Testnet'
                  : /mainnet/i.test(text) ? 'Mainnet'
                  : null;
    if (network && !isSyncing) {
      isSyncing = true;
      requestAnimationFrame(() => {
        syncExampleSelector(network);
        requestAnimationFrame(() => { isSyncing = false; });
      });
    }
  }, true);
}
