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

let configureCallCount = 0;
let isSyncing = false;
let currentNetwork: 'testnet' | 'mainnet' | null = null;

export function configure(context: any) {
  configureCallCount++;

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

  // NOTE: rv.body injection was tried here but Replay's modal doesn't process it
  // as expected. Instead, we sync the modal's "Pick an example" dropdown via DOM
  // interaction in syncModalExampleViaOpen(), triggered when the user
  // changes the modal's environment dropdown.

  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    console.log(`[configure.ts] configure() #${configureCallCount}`, {
      currentNetwork,
      hasApiKey: !!apiKey,
      hasBearer: !!bearer,
    });
  }

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

/**
 * Programmatically switch the example selector to match the given network.
 * This is the reverse of syncServerSelector — when the user picks a server,
 * we update the example dropdown to show the matching named example.
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
  console.warn(`[configure.ts] Example option for ${network} not found`);
}

/**
 * Log all select-like components currently in the DOM for debugging.
 */
function logModalSelects() {
  const redoclySelects = document.querySelectorAll('[data-component-name="Select/Select"]');
  const reactSelects = document.querySelectorAll('[class*="react-select"]');
  const nativeSelects = document.querySelectorAll('select');

  console.log(`[configure.ts] DOM selects: ${redoclySelects.length} Select/Select, ${reactSelects.length} react-select, ${nativeSelects.length} native`);

  redoclySelects.forEach((el, i) => {
    const testId = (el as HTMLElement).dataset.testid || '(none)';
    const items = el.querySelectorAll('[data-component-name="Dropdown/DropdownMenuItem"]');
    const texts = Array.from(items).map(li => li.textContent?.trim());
    console.log(`[configure.ts]   Select/Select[${i}] testid="${testId}" items=[${texts.join(', ')}]`);
  });
}

/**
 * Inside the Replay modal, find the "Pick an example" dropdown
 * (Redocly's Select/Select component), open it, then click the
 * DropdownMenuItem matching the given network.
 *
 * We open the dropdown first (rather than clicking a hidden item
 * directly) to ensure the React onClick chain fires reliably.
 */
function syncModalExampleViaOpen(network: string) {
  const selects = document.querySelectorAll<HTMLElement>(
    '[data-component-name="Select/Select"]'
  );

  console.log(`[configure.ts] syncModalExampleViaOpen("${network}") — ${selects.length} Select/Select found`);

  for (const select of selects) {
    if (select.dataset.testid === 'request-body-type-select') continue;

    const items = select.querySelectorAll<HTMLElement>(
      '[data-component-name="Dropdown/DropdownMenuItem"]'
    );
    const itemTexts = Array.from(items).map(i => i.textContent?.trim());
    console.log(`[configure.ts]   testid="${select.dataset.testid || '(none)'}" items: [${itemTexts.join(', ')}]`);

    // Find the matching item
    const target = Array.from(items).find(
      item => item.textContent?.toLowerCase().includes(network)
    );
    if (!target) continue;

    // Step 1: Open the dropdown by clicking the SelectInput trigger
    const trigger = select.querySelector('[placeholder="Pick an example"]')
                 || select.querySelector('[data-component-name="Select/SelectInput"]')
                 || select.children[0];
    if (trigger) {
      console.log(`[configure.ts]   Opening dropdown via trigger click`);
      (trigger as HTMLElement).click();
    }

    // Step 2: After dropdown opens, click the matching item
    setTimeout(() => {
      console.log(`[configure.ts]   Clicking item "${target.textContent?.trim()}"`);
      target.click();
    }, 80);

    return;
  }

  console.warn(`[configure.ts]   No example picker found or no matching item for "${network}"`);
}

function setupEnvironmentObserver() {
  // Example → Server sync (existing direction)
  document.addEventListener('change', (e) => {
    const target = e.target as HTMLSelectElement;
    if (target.tagName === 'SELECT' && target.classList.contains('dropdown-select')) {
      const selectedText = target.options[target.selectedIndex]?.textContent?.trim() || '';
      const network = /testnet/i.test(selectedText) ? 'Testnet'
                    : /mainnet/i.test(selectedText) ? 'Mainnet'
                    : null;
      if (network && !isSyncing) {
        currentNetwork = network.toLowerCase() as 'testnet' | 'mainnet';
        isSyncing = true;
        // Small delay: let Redocly finish processing the example change first
        setTimeout(() => syncServerSelector(network), 50);
        setTimeout(() => { isSyncing = false; }, 200);
      }
    }
  }, true);

  // Server → Example sync (new reverse direction)
  document.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest?.(
      '[data-component-name="Dropdown/DropdownMenuItem"]'
    ) as HTMLElement | null;
    if (!item) return;

    const text = item.textContent || '';
    // Only react to server dropdown items (contain fastnear RPC URLs)
    if (!text.includes('fastnear.com')) return;

    const network = /testnet/i.test(text) ? 'Testnet'
                  : /mainnet/i.test(text) ? 'Mainnet'
                  : null;
    if (network && !isSyncing) {
      currentNetwork = network.toLowerCase() as 'testnet' | 'mainnet';
      isSyncing = true;
      setTimeout(() => syncExampleSelector(network), 50);
      setTimeout(() => { isSyncing = false; }, 200);
    }
  }, true);

  // --- Modal environment → example sync ---
  // The modal's environment selector is a react-select component. React-select
  // may unmount/remount the SingleValue element on selection change, which would
  // break a MutationObserver watching a specific element ref. Instead we poll:
  // re-query the DOM each tick so we always read from the live element.

  let modalPollInterval: ReturnType<typeof setInterval> | null = null;
  let lastEnvText: string | null = null;

  const startModalPoll = () => {
    if (modalPollInterval) return; // already polling
    lastEnvText = null;

    modalPollInterval = setInterval(() => {
      const envEl = document.querySelector('[data-testid="environment-select"]');
      if (!envEl) {
        // Modal closed — stop polling
        console.log('[configure.ts] Modal closed, stopping environment poll');
        stopModalPoll();
        return;
      }

      const text = envEl.textContent?.trim() || '';
      if (text === lastEnvText) return; // no change

      const prevText = lastEnvText;
      lastEnvText = text;

      const network = /testnet/i.test(text) ? 'testnet'
                    : /mainnet/i.test(text) ? 'mainnet'
                    : null;

      console.log(`[configure.ts] Environment poll: "${prevText}" → "${text}" (network=${network})`);

      // Log all Select/Select components currently in DOM
      logModalSelects();

      if (network && prevText !== null) {
        // Only sync if this is a CHANGE (not the initial detection)
        currentNetwork = network;
        setTimeout(() => syncModalExampleViaOpen(network), 150);
      }
    }, 300);

    console.log('[configure.ts] Started modal environment polling');
  };

  const stopModalPoll = () => {
    if (modalPollInterval) {
      clearInterval(modalPollInterval);
      modalPollInterval = null;
      lastEnvText = null;
    }
  };

  // Detect modal open via document-level MutationObserver, then start polling
  new MutationObserver(() => {
    const envEl = document.querySelector('[data-testid="environment-select"]');
    if (envEl && !modalPollInterval) {
      startModalPoll();
    }
  }).observe(document.body, { childList: true, subtree: true });

  // --- Initial network detection ---
  // If the server was persisted from a previous session, detect it on setup
  const trigger = document.querySelector<HTMLElement>(
    '[data-component-name="Dropdown/DropdownTrigger"]'
  );
  if (trigger) {
    const triggerText = trigger.textContent || '';
    if (/testnet/i.test(triggerText)) {
      currentNetwork = 'testnet';
      console.log('[configure.ts] Initial network detected: testnet');
    } else if (/mainnet/i.test(triggerText)) {
      currentNetwork = 'mainnet';
      console.log('[configure.ts] Initial network detected: mainnet');
    }
  }
}