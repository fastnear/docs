# 03 Browser Automation And Verification

Browser automation is now part of the normal working loop for this repo, especially for custom interactions, auth persistence, and layout work.

Lint is necessary, but it is not enough. The important failures we have found recently were browser-runtime issues:

- narrow-column layout caused by mounting into the wrong Redocly region
- misleading auth UX around the Security modal
- CORS/preflight failures caused by query-param auth on live browser requests
- hydration/state mismatches that only show up in a real browser

## Recommended Targets

### Redocly portal

- `npm run preview`

Default preview is `http://127.0.0.1:4000`, but if that port is occupied, use the actual URL printed at startup.

Key routes to compare:

- `/rpcs/account/view_account`
- `/reference/operation/view_account`

### Local verification runtime

- `npm run standalone:dev`
- `http://127.0.0.1:4010/rpcs/account/view_account`

## Tooling Expectation

The repo does not currently maintain a first-class Playwright test suite. In practice, browser automation has been done with:

- ad hoc Playwright scripts
- headless browser runs
- screenshot capture
- request interception
- clipboard inspection

If Playwright is not already available in the environment, use an ad hoc `npx playwright` flow rather than blocking on permanent test-suite setup.

## What To Verify For Custom Interaction Work

### Layout

- The pilot is mounted in the correct part of the page.
- The interaction uses the full available request-row width.
- The response pane has enough space to be useful.
- Mobile widths stack cleanly.
- Inputs remain legible in the active color scheme.

For the Redocly pilot, the key regression to avoid is the interaction rendering in the narrow pre-title column instead of the full request row.

### Auth state

- empty browser state
- saved browser API key
- cleared browser API key
- `?apiKey=` override
- persistence across navigation
- persistence across reload

### Live request behavior

- no-auth request succeeds
- keyed request succeeds
- selected network changes the endpoint
- selected finality changes the JSON-RPC payload and copied curl command
- actual request uses the intended auth header shape for the surface under test
- copied cURL matches the live request shape
- no `requestfailed` events
- no CORS console errors

### Redocly-vs-standalone parity

- same auth precedence
- same network switching behavior
- same effective request payload
- same cURL auth shape

## Good Browser Artifacts To Capture

- one screenshot of the page in the problematic viewport
- one screenshot after the fix
- console errors and warnings
- intercepted network request URL and headers
- localStorage snapshot before and after auth changes
- clipboard contents for copied cURL

These artifacts make future continuity much better than prose-only notes.

## Suggested Working Recipe

1. Start the target runtime.
2. Open the exact route under test.
3. Exercise the full auth matrix.
4. Capture one screenshot and one request log.
5. Compare Redocly and standalone when the change touches shared behavior.
6. Run `npm run lint` after browser validation.

## `view_account` Regression Matrix

For the current pilot and local verification runtime, these cases are the minimum useful set:

- `/rpcs/account/view_account` with no auth
- `/rpcs/account/view_account` with saved browser API key
- `/rpcs/account/view_account?apiKey=...`
- `/rpcs/account/view_account?apiKey=...&network=testnet`
- `/reference/operation/view_account`
- standalone `/rpcs/account/view_account`

## When To Write It Down

If browser automation reveals a non-obvious rule, document it immediately. Recent examples worth preserving were:

- full-width Redocly injection required a request-row portal, not a simple pre-title hook render
- the Security modal is docs-only, not an editable auth UI
- `?apiKey=` can stay as the public contract even when the browser transport uses a different header shape such as `Authorization: Bearer`
