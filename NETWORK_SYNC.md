# Network Sync: Dynamic Request Parameter Syncing

## Overview

When a user selects "Testnet" or "Mainnet" on an operation page, three UI elements must stay in sync:

1. The **Example Selector** (named examples like "Mainnet" / "Testnet" from YAML)
2. The **Server Selector** (RPC endpoint URL dropdown)
3. The **Replay Modal body** (the request body inside the "Try It" console)

This file documents how the syncing works, what libraries are involved, and known limitations.

---

## Architecture

### The three UI elements

| Element | Implementation | State library |
|---------|---------------|---------------|
| Example Selector | `<select class="dropdown-select">` — native HTML select rendered by `@redocly/openapi-docs` | **Jotai** atoms (`@redocly/openapi-docs/lib-esm/jotai/`) |
| Server Selector | `Dropdown/DropdownMenuItem` — Redocly's custom React dropdown component | **Jotai** atoms (same store) |
| Replay Modal body | `ReplayOverlay` — lazy-loaded from `@redocly/replay` | **hookstate** (`@hookstate/core`) |

The page-level selectors (Example + Server) live in the Jotai atom tree managed by `@redocly/openapi-docs`. The Replay modal uses a completely separate state library (hookstate via `@redocly/replay`). The bridge between them is DOM interaction — we programmatically click dropdown items to trigger internal state updates.

---

## State Management Landscape

### Page level: Jotai

`@redocly/openapi-docs` uses Jotai atoms for operation-page state:

- Selected server URL
- Selected example
- Request body values
- Security credentials

These atoms are internal to Redocly's components and not directly accessible to theme extensions.

### Replay modal: hookstate

`@redocly/replay` manages its own state via `@hookstate/core`. When the modal opens, it creates a fresh `OpenAPIParser` from the spec and calls `getOperation()` for each operation, which invokes `configure()`.

### Bridge: DOM interaction

Both page-level and modal-level syncs work by programmatically clicking native Redocly UI elements, which trigger the framework's own state management handlers:

- **Page level**: Click `Dropdown/DropdownMenuItem` items (server picker) and set `select.dropdown-select` values (example picker) — both trigger React/Jotai state updates.
- **Modal level**: Click `Dropdown/DropdownMenuItem` items inside the modal's `Select/Select` components — this triggers hookstate onChange handlers.

---

## Sync Directions

### Example → Server (page level)

**Trigger**: User changes the example dropdown (`select.dropdown-select`).

**Flow**:
1. `change` event fires on the `<select>` element
2. `setupEnvironmentObserver()` listener detects the event
3. Extracts network name from selected option text (looks for "testnet" or "mainnet")
4. Sets `currentNetwork` module variable
5. Calls `syncServerSelector(network)` after 50ms delay
6. `syncServerSelector()` finds and `.click()`s the matching `DropdownMenuItem` containing the fastnear.com URL

### Server → Example (page level)

**Trigger**: User clicks a server URL in the server dropdown.

**Flow**:
1. `click` event fires on a `DropdownMenuItem`
2. `setupEnvironmentObserver()` listener detects the event
3. Checks that the item text contains `fastnear.com` (to filter out non-server dropdowns)
4. Extracts network name from item text
5. Sets `currentNetwork` module variable
6. Calls `syncExampleSelector(network)` after 50ms delay
7. `syncExampleSelector()` finds the matching `<option>` in `select.dropdown-select` and sets `.value` + dispatches a `change` event

### Modal Environment → Example (modal level)

**Trigger**: User changes the environment dropdown inside the Replay modal.

**Detection mechanism**: Polling (not MutationObserver). The modal's environment selector is a **react-select** component, which may unmount/remount the `SingleValue` DOM element on selection change (React reconciliation). A MutationObserver watching a specific element ref would break when the element is replaced. Instead, we poll every 300ms, re-querying `[data-testid="environment-select"]` each tick to always read from the live DOM.

**Flow**:
1. Document-level MutationObserver detects `[data-testid="environment-select"]` appearing in the DOM (modal opened)
2. `startModalPoll()` begins a 300ms interval that re-queries the environment selector element each tick
3. On each tick, reads `envEl.textContent` and compares to `lastEnvText`
4. On first detection, records the initial environment text but does NOT trigger a sync (initial detection only)
5. On subsequent changes (e.g., "NEAR Mainnet RPC" → "NEAR Testnet RPC"), extracts network name
6. Sets `currentNetwork` module variable
7. After 150ms delay (to let react-select finish its state update), calls `syncModalExampleViaOpen(network)`
8. `syncModalExampleViaOpen()` finds all `Select/Select` components, skips the media type selector (by `data-testid`), finds the example picker with a `DropdownMenuItem` matching the network
9. Opens the dropdown by clicking the `SelectInput` trigger (or first child), waits 80ms, then clicks the matching item
10. The click fires the Select component's `selectHandler()` → `onChange()`, which updates hookstate `activeExampleName` and replaces the body with the full YAML example
11. When the modal closes (environment-select element disappears from DOM), `stopModalPoll()` clears the interval

---

## The Modal's DOM Structure

### Environment Selector (upper right)

```
<div data-component-name="Select/Select" data-testid="environment-select">
  <div data-component-name="Select/SelectInput">
    rpc.mainnet.fastnear.com          ← currently selected
  </div>
  <ul data-component-name="Dropdown/DropdownMenu" role="menu">
    <li data-component-name="Dropdown/DropdownMenuItem" role="menuitem">
      rpc.mainnet.fastnear.com
    </li>
    <li data-component-name="Dropdown/DropdownMenuItem" role="menuitem">
      rpc.testnet.fastnear.com
    </li>
    <li ...>archival-rpc.mainnet.fastnear.com</li>
    <li ...>archival-rpc.testnet.fastnear.com</li>
  </ul>
</div>
```

### Example Picker ("Pick an example")

```
<div data-component-name="Select/Select" data-testid="select">
  <div data-component-name="Select/SelectInput">
    Pick an example                    ← placeholder / current selection
  </div>
  <ul data-component-name="Dropdown/DropdownMenu" role="menu">
    <li data-component-name="Dropdown/DropdownMenuItem" role="menuitem">
      mainnet                          ← YAML named example
    </li>
    <li data-component-name="Dropdown/DropdownMenuItem" role="menuitem">
      testnet                          ← YAML named example
    </li>
  </ul>
</div>
```

### Why we open-then-click (not click hidden items directly)

The `Select/Select` component (from `@redocly/theme`) renders its dropdown children into the DOM even when the dropdown is closed — visibility is controlled by CSS, not conditional rendering. While `HTMLElement.click()` works on hidden elements in theory, we found that the "open dropdown first, then click" approach is more reliable: we click the `SelectInput` trigger to open the dropdown, wait 80ms for the dropdown to render in its open state, then click the matching `DropdownMenuItem`. This fires the React `onClick` handler reliably, calling `onAction()` → `selectHandler(option)` → `onChange(value)`.

### Key `data-testid` values in the modal

| `data-testid` | Component | Purpose |
|----------------|-----------|---------|
| `environment-select` | Environment dropdown | Server/environment picker (upper right) |
| `request-body-type-select` | Media type dropdown | Content type picker (e.g. application/json) |
| `request-method-select` | Method dropdown | HTTP method (GET, POST, etc.) |
| `url-input` | URL input field | Request URL |
| `select` (default) | Example picker | "Pick an example" dropdown — has the default `data-testid` |

---

## Anti-Sync Guard

The `isSyncing` boolean flag prevents infinite loops on page-level syncs:

```
Example change → sets isSyncing=true → syncServerSelector() clicks server item
                                         ↓
                              Server click listener fires
                              BUT isSyncing=true → skipped
                                         ↓
                              setTimeout clears isSyncing after 200ms
```

Without this guard: Example change → Server click → Example change → Server click → ...

The modal-level sync does not need this guard because the environment → example direction is one-way (changing the example doesn't trigger an environment change).

---

## Known Limitations

1. **Modal sync only fires on environment change**: The example picker inside the modal is synced when the user explicitly changes the environment dropdown. If the user opens the modal and the default environment already matches a network, the example won't auto-select — the user must interact with the environment dropdown. (The initial detection is intentionally skipped to avoid unwanted sync on modal open.)

2. **Only works for operations with named examples**: If an operation's YAML doesn't have "mainnet"/"testnet" named examples, `syncModalExampleViaOpen()` won't find a matching item — it logs a warning but causes no errors.

3. **Legacy Redocly flow still uses URL-only request shaping**: When validating the old Redocly path, query params like `?apiKey=` and `?body=` still flow through `configure.ts`. Public hosted pages are now direct-rendered in `builder-docs` and can emit `postMessage` resize events when embedded externally.

4. **Sync delays**: The `setTimeout` delays in sync functions (50ms page-level, 150ms + 80ms modal-level) are necessary to let Redocly/react-select finish processing state changes, but can cause brief visual flicker.

5. **Initial network detection is best-effort**: `setupEnvironmentObserver()` checks the `DropdownTrigger` text on first `configure()` call. If the DOM hasn't rendered the server dropdown yet, `currentNetwork` remains `null` until the user interacts.

6. **300ms polling interval**: The modal environment change detection uses a 300ms polling interval. This means there's up to ~300ms latency between the user selecting a new environment and the example picker updating. This is imperceptible to users but worth noting for debugging.

---

## Jotai `atomFamily` Deprecation

### The warning

```
[DEPRECATED] atomFamily is deprecated and will be removed in v3
```

### Source

- `@redocly/openapi-docs` v3.7.0 imports `atomFamily` from `jotai/utils`
- Jotai version installed: 2.18.0 (transitive dependency via `@redocly/realm` → `@redocly/openapi-docs`)
- The deprecation warning fires only in dev mode (`import.meta.env.MODE !== "production"`)
- Our code has **zero** Jotai imports — this is entirely from Redocly's internal code

### Fix path

- Current `@redocly/realm` version: 0.119.1
- Latest available: 0.130.4
- Upgrading realm may resolve the warning if the newer `@redocly/openapi-docs` version has migrated away from `atomFamily`

### No action needed in our code

Since the deprecation is in a transitive dependency, the only fix is upgrading `@redocly/realm`. This should be tested carefully as major version bumps in realm can change theme APIs.

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `@theme/ext/configure.ts` | Extension hook: auth injection, environment→example sync, debug logging |
| `@theme/styles.css` | Verification-only CSS overrides for the legacy Redocly surface |
| `redocly.yaml` | Portal config: API definitions, display settings, chrome visibility |
| `rpcs/openapi.yaml` | Aggregate RPC spec with all 40 operations |
| `scripts/test-operations.js` | Smoke-test representative legacy verification routes |
| `scripts/standalone-dev.js` | Run the standalone local verification runtime |
| `node_modules/@redocly/replay/dist/replay.js` | Replay modal source (environment selector `S7()`, example picker) |
| `node_modules/@redocly/theme/lib/components/Select/Select.js` | Select component: renders items inline, `selectHandler()` → `onChange()` |
| `node_modules/@redocly/theme/lib/components/Dropdown/DropdownMenuItem.js` | Menu item: `onClick` → `onAction()` handler |
