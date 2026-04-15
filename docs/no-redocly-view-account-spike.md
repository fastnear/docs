# No-Redocly `view_account` Spike

This repo now includes a standalone `view_account` page that runs without `@redocly/*` runtime code and preserves the current auth/query contract on its own dev server. It now serves mainly as local verification and historical architecture context rather than the public runtime.

## What This Spike Replaced

- Redocly operation-page rendering for `view_account`
- Redocly hooks for the custom interaction entry point
- Redocly theme components used by the pilot interaction
- Redocly request/response schema rendering for this one operation

The standalone page still reads the same leaf source spec, `rpcs/account/view_account.yaml`, and preserves the same browser auth contract:

- `?apiKey=` override
- `?network=`
- `fastnear:apiKey`
- `fastnear_api_key` as a legacy fallback during migration

## What Still Depends On Redocly

- The main docs portal, portal chrome, search, navigation, and publication target
- Generic OpenAPI route generation across all APIs and RPC operations
- Try-It population for REST APIs via `configure.ts`
- Generic reference rendering for operations outside this spike
- Multi-language code sample generation and the broader response/request presentation system

## Working Result

The standalone spike is served by `npm run standalone:dev` at:

- `http://127.0.0.1:4010/rpcs/account/view_account`

Verified locally on April 12, 2026:

- The standalone route returns `200 OK`
- The page renders title, summary, security details, live interaction, request example, request schema, and response schema
- Live requests succeed for:
  - no auth
  - saved browser API key
  - `?apiKey=` override
  - testnet switching
- Copied cURL matches the live request auth shape and uses `Authorization: Bearer`
- The standalone source and shared auth module contain no `@redocly/*` imports

## Comparison To The Current Redocly Pilot

What reached parity:

- Full-width blockchain-native interaction
- Browser auth persistence and URL override behavior
- Mainnet/testnet switching derived from the spec
- A meaningful request/response reference page for this operation

What is still thinner than Redocly:

- No generic deep links, share links, or operation shell conventions
- No generic handling yet for callbacks, multiple response variants, or richer schema features
- No automatic multi-language samples beyond the custom cURL path
- No generic route generation for more operations yet

Complexity snapshot:

- The original standalone implementation added about `2162` lines across the page, styles, generator, standalone build/runtime scripts, and shared auth module
- The current Redocly-specific pilot wiring is about `873` lines across the custom interaction and operation hook, with the rest of the page still outsourced to Redocly

## What It Would Take To Expand

To support the next 3 RPC endpoints:

- Generalize the standalone page-model generator from one hard-coded leaf spec to an operation registry
- Add more interaction kinds beyond `rpc-view-account`
- Broaden the custom schema renderer for more OpenAPI shapes
- Introduce route generation for more pretty paths on the standalone server/build

To support the REST APIs later:

- Rebuild path/query/header parameter docs and forms
- Recreate preset injection and embed-specific request shaping from `configure.ts`
- Handle multiple services, pinned network variants, and more diverse response/media shapes
- Decide whether to build a full custom reference system or keep some renderer in the stack

## Practical Conclusion

This spike proves we can replace Redocly for one complete RPC operation page when the interaction and the surrounding reference are tightly scoped.

It does **not** mean we are close to replacing the whole paid Redocly footprint. The remaining work is now clearly in the generic docs-platform layer, not in the `view_account` interaction layer.
