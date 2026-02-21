/* eslint-disable no-restricted-globals */

type RequestValues = {
  headers?: Record<string, string>;
  query?: Record<string, string>;
  security?: Record<string, any>;
  envVariables?: Record<string, string>;
};

// Security scheme IDs that might be in your OpenAPI spec
const API_KEY_SCHEMES = ["ApiKeyAuth", "api_key", "api_keys", "fastnear_api_key"];
const BEARER_SCHEMES = ["bearerAuth", "jwt", "BearerAuth"];

let configureCallCount = 0;

export function configure(context: any) {
  configureCallCount++;
  console.log(`[configure.ts] configure() called (#${configureCallCount})`, {
    context,
    contextKeys: context ? Object.keys(context) : [],
    contextStringified: JSON.stringify(context, null, 2),
  });

  // One-time DOM observer: watch for Environment dropdown changes
  if (typeof window !== "undefined" && configureCallCount === 1) {
    setupEnvironmentObserver();
  }

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
    envVariables: {} 
  };

  if (apiKey) {
    // Add API key to query params (FastNEAR uses this format)
    rv.query!["apiKey"] = apiKey;
    
    // Also add to headers in case some endpoints expect it there
    rv.headers!["x-api-key"] = apiKey;
    
    // Fill any API key security schemes defined in OpenAPI
    for (const id of API_KEY_SCHEMES) {
      rv.security![id] = apiKey;
    }
    
    // Make available in code samples as {{API_KEY}}
    rv.envVariables!.API_KEY = apiKey;
    
    console.log('FastNEAR API key configured for Try-It console');
  }

  if (bearer) {
    // Add Bearer token to Authorization header
    rv.headers!["Authorization"] = `Bearer ${bearer}`;
    
    // Fill bearer security schemes
    for (const id of BEARER_SCHEMES) {
      rv.security![id] = bearer;
    }
    
    // Make available in code samples as {{ACCESS_TOKEN}}
    rv.envVariables!.ACCESS_TOKEN = bearer;
  }

  // Log for debugging (remove in production)
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    console.log('Redocly configure.ts - Request values configured:', {
      hasApiKey: !!apiKey,
      hasBearer: !!bearer,
      queryParams: Object.keys(rv.query || {}),
      headers: Object.keys(rv.headers || {})
    });
  }

  console.log(`[configure.ts] returning requestValues (#${configureCallCount})`, rv);
  return { requestValues: rv };
}

/**
 * Programmatically switch the server/environment selector by clicking
 * Redocly's own dropdown menu item. This triggers the React-managed
 * onAction callback, updating the Jotai atom from within React's tree.
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
  console.warn(`[configure.ts] Server menu item for ${network} not found`);
}

function setupEnvironmentObserver() {
  document.addEventListener('change', (e) => {
    const target = e.target as HTMLSelectElement;
    if (target.tagName === 'SELECT' && target.classList.contains('dropdown-select')) {
      const selectedText = target.options[target.selectedIndex]?.textContent?.trim() || '';
      const network = /testnet/i.test(selectedText) ? 'Testnet'
                    : /mainnet/i.test(selectedText) ? 'Mainnet'
                    : null;
      if (network) {
        // Small delay: let Redocly finish processing the example change first
        setTimeout(() => syncServerSelector(network), 50);
      }
    }
  }, true);
}