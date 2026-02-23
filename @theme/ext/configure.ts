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

let envSyncInitialized = false;
let isSyncing = false;

export function configure(context: any) {
  const search =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();

  // One-time setup for bidirectional sync between server and example dropdowns
  if (typeof window !== "undefined" && !envSyncInitialized) {
    envSyncInitialized = true;
    setupEnvironmentSync();
  }

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

// ---------------------------------------------------------------------------
// Bidirectional sync: server dropdown ↔ example dropdown
// ---------------------------------------------------------------------------
// Redocly's server selector and example selector are independent UI elements.
// When the user picks "Testnet" server, we auto-switch to the testnet example
// (and vice versa) so the request body matches the selected network.

/**
 * Click the server dropdown item matching the given network name.
 */
function syncServerSelector(network: string) {
  const items = document.querySelectorAll<HTMLElement>(
    '[data-component-name="Dropdown/DropdownMenuItem"]'
  );
  for (const item of items) {
    const text = item.textContent || '';
    if (text.includes(`://rpc.${network.toLowerCase()}.fastnear.com`)) {
      item.click();
      console.log(`[configure.ts] Server auto-switched to ${network}`);
      return;
    }
  }
}

/**
 * Set the example <select> to the option matching the given network name.
 */
function syncExampleSelector(network: string) {
  const selects = document.querySelectorAll<HTMLSelectElement>('select.dropdown-select');
  for (const select of selects) {
    for (const option of select.options) {
      const text = option.textContent || '';
      if (text.toLowerCase().includes(network.toLowerCase())) {
        if (select.value !== option.value) {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          console.log(`[configure.ts] Example auto-switched to ${network}`);
        }
        return;
      }
    }
  }
}

/**
 * Resolve when an element matching `selector` appears in the DOM.
 * Uses MutationObserver; times out to prevent leaked observers.
 */
function waitForElement(selector: string, timeoutMs = 3000): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLElement>(selector);
    if (existing) { resolve(existing); return; }

    const observer = new MutationObserver(() => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) { cleanup(); resolve(el); }
    });

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`waitForElement("${selector}") timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    const cleanup = () => { observer.disconnect(); clearTimeout(timer); };

    observer.observe(document.body, { childList: true, subtree: true });
  });
}

/**
 * Inside the Try-It modal, open the "Pick an example" dropdown
 * (a Select/Select component) and click the item matching `network`.
 * We open first to ensure React's onClick chain fires reliably.
 */
function syncModalExampleViaOpen(network: string) {
  const selects = document.querySelectorAll<HTMLElement>(
    '[data-component-name="Select/Select"]'
  );

  for (const select of selects) {
    if (select.dataset.testid === 'request-body-type-select') continue;

    const items = select.querySelectorAll<HTMLElement>(
      '[data-component-name="Dropdown/DropdownMenuItem"]'
    );
    const target = Array.from(items).find(
      item => item.textContent?.toLowerCase().includes(network)
    );
    if (!target) continue;

    // Open the dropdown by clicking the trigger
    const trigger = select.querySelector('[placeholder="Pick an example"]')
                 || select.querySelector('[data-component-name="Select/SelectInput"]')
                 || select.children[0];
    if (trigger) (trigger as HTMLElement).click();

    // After dropdown opens, click the matching item
    requestAnimationFrame(() => target.click());
    return;
  }
}

function setupEnvironmentSync() {
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

  // --- Modal environment → example sync ---
  // The modal's environment selector is a react-select that may unmount/remount
  // on selection change. We poll rather than observe a specific element ref.
  let modalPollInterval: ReturnType<typeof setInterval> | null = null;
  let lastEnvText: string | null = null;

  const stopModalPoll = () => {
    if (modalPollInterval) {
      clearInterval(modalPollInterval);
      modalPollInterval = null;
      lastEnvText = null;
    }
  };

  const startModalPoll = () => {
    if (modalPollInterval) return;
    lastEnvText = null;

    modalPollInterval = setInterval(() => {
      const envEl = document.querySelector('[data-testid="environment-select"]');
      if (!envEl) { stopModalPoll(); return; } // modal closed

      const text = envEl.textContent?.trim() || '';
      if (text === lastEnvText) return; // no change
      lastEnvText = text;

      const network = /testnet/i.test(text) ? 'testnet'
                    : /mainnet/i.test(text) ? 'mainnet'
                    : null;
      if (network) {
        const selector = '[data-component-name="Select/Select"]:not([data-testid="request-body-type-select"])';
        waitForElement(selector).then(() => {
          syncModalExampleViaOpen(network);
        }).catch(() => {});
      }
    }, 300);
  };

  // Detect modal open via MutationObserver, then start polling
  new MutationObserver(() => {
    const envEl = document.querySelector('[data-testid="environment-select"]');
    if (envEl && !modalPollInterval) startModalPoll();
  }).observe(document.body, { childList: true, subtree: true });
}
