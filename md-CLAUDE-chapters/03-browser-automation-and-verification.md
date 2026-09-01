# 03 Browser Automation And Verification

Browser automation is now part of the normal working loop for this repo, especially for custom interactions, auth persistence, and layout work.

Lint is necessary, but it is not enough. The important failures we have found in practice were browser-runtime issues:

- CORS/preflight failures caused by query-param auth on live browser requests
- hydration/state mismatches that only show up in a real browser
- layout regressions that lint cannot catch

## Recommended Target

- `npm run standalone:dev`
- `http://127.0.0.1:4010/rpcs/account/view_account` (or any other canonical `/rpcs/...` or `/apis/...` route)

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

## Good Browser Artifacts To Capture

- one screenshot of the page in the problematic viewport
- one screenshot after the fix
- console errors and warnings
- intercepted network request URL and headers
- localStorage snapshot before and after auth changes
- clipboard contents for copied cURL

These artifacts make future continuity much better than prose-only notes.

## Suggested Working Recipe

1. Start `npm run standalone:dev`.
2. Open the exact route under test.
3. Exercise the full auth matrix.
4. Capture one screenshot and one request log.
5. Run `npm run lint` after browser validation.

## `view_account` Regression Matrix

A minimum useful set against `http://127.0.0.1:4010`:

- `/rpcs/account/view_account` with no auth
- `/rpcs/account/view_account` with saved browser API key
- `/rpcs/account/view_account?apiKey=...`
- `/rpcs/account/view_account?apiKey=...&network=testnet`

## When To Write It Down

If browser automation reveals a non-obvious rule, document it immediately. An example worth preserving:

- `?apiKey=` stays as the public contract even when the browser transport uses a different header shape such as `Authorization: Bearer` (query-param auth caused CORS/preflight failures in practice).
