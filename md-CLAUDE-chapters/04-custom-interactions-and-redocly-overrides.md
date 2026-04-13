# 04 Custom Interactions And Redocly Overrides

This chapter explains how the current bespoke RPC slices are wired into the Redocly runtime and how the same override pattern now extends to a first FastNEAR API endpoint.

## Current Pilot Surface

The current bespoke slice is operation-specific and opt-in.

The enabling extensions are currently on:

- `rpcs/account/view_account.yaml`
- `rpcs/account/view_access_key.yaml`
- `rpcs/account/view_access_key_list.yaml`
- `rpcs/block/block_by_height.yaml`
- `rpcs/block/block_by_id.yaml`
- `rpcs/block/block_effects.yaml`

using:

- `x-fastnear-interaction: { kind: rpc-view-account }`
- `x-fastnear-interaction: { kind: rpc-view-access-key }`
- `x-fastnear-interaction: { kind: rpc-view-access-key-list }`
- `x-fastnear-interaction: { kind: rpc-block-by-height }`
- `x-fastnear-interaction: { kind: rpc-block-by-id }`
- `x-fastnear-interaction: { kind: rpc-block-effects }`

That keeps the custom behavior local to specific RPC slices instead of turning it on globally.

For synced FastNEAR API endpoints, the opt-in now lives in the portal-owned enhancements layer instead of the leaf spec itself.

Current API pilot:

- `enhancements/fastnear/manifest.yaml`
- canonical path: `/apis/fastnear/v1/public_key_lookup`
- custom page metadata:
  - `kind: fastnear-rest-read`
  - `pageModelId: fastnear-v1-public-key-lookup`
  - `replaceOperationPage: true`
  - `authTransport: bearer`

That is the important pattern difference:

- generator-owned RPC leaf specs can safely carry bespoke extensions through `scripts/nearcore-operation-map.js`
- synced REST/API leaf specs should use enhancement-manifest metadata so `npm run sync:apis` does not erase the customization

## Shared Interaction Runtime

The main bespoke UI now lives in:

- `shared/FastnearOperationPage.tsx`

That shared runtime is responsible for:

- network switching
- finality selection
- field rendering from the request schema, including account ID, public key, block height, and block hash where required
- inline API-key editing
- browser auth persistence through `shared/portalAuth.ts`
- live request execution
- cURL generation
- response rendering

The runtime is intentionally spec-driven where possible:

- server URLs come from the operation definition
- named examples seed defaults
- the request reference is derived from the standalone-generated page model

## Two Surfaces, One Runtime

The same shared runtime currently renders in two places.

### Redocly operation page

- injected through `@theme/components/OpenApiDocs/hooks/BeforeOpenApiOperation.tsx`

### Local verification runtime

- `standalone/src/app.tsx`

This lets us validate both:

- route-level replacement on the real operation page
- direct runtime behavior outside the Redocly shell

## Why The Request-Row Portal Exists

The first version of the pilot rendered in a narrow region near the operation summary. That made the whole interaction feel cramped even though the operation page below had more width available.

The current fix is to portal the custom interaction into the actual request row:

- find the request-samples container
- find its parent row
- add a dedicated target element
- render the pilot there with `createPortal`

This gives the pilot the full operation-width footprint while keeping the route and operation shell intact.

## Lower Reference Replacement

The bespoke RPC routes now go one step further than the initial pilot.

- `shared/ViewAccountReference.tsx` renders the request reference, example tabs, request schema, and response schema
- the same shared component is used on both the standalone app and the Redocly route
- `BeforeOpenApiOperation.tsx` hides the trailing stock Redocly operation subrows for the bespoke RPC endpoints after mounting the custom reference section inside the request row
- the same hook now also looks up manifest-backed custom pages for API routes and only mounts the bespoke page on the targeted `operationId`, even when the surrounding aggregate page contains sibling operations from the same tag

That means the current Redocly account and block pages in this slice are now mostly ours from the title downward:

- Redocly still owns the outer operation shell, heading row, and Security modal
- FastNEAR-owned code now renders the live interaction and the lower request/response reference content

## Operation-Context Copy

The Redocly operation surface still shows:

- description
- external docs if present
- Security documentation

But it now adds a clarifying note:

- the Security button documents the scheme
- the inline API-key field is what actually authenticates live requests

This avoids misleading users into expecting the Security modal to behave like an editor.

## Layout Rules

The custom pilot uses a split layout:

- controls on the left
- live response on the right
- stacked on narrower screens

The current CSS lives in `@theme/styles.css` under `.fastnear-interaction*` and `.fastnear-operation-pilot*`.

## Constraints To Remember

- The current bespoke slice currently supports six kinds:
  - `rpc-view-account`
  - `rpc-view-access-key`
  - `rpc-view-access-key-list`
  - `rpc-block-by-height`
  - `rpc-block-by-id`
  - `rpc-block-effects`
- It is still operating inside the Redocly page shell.
- The route contract has intentionally not changed.
- The interaction uses header-based browser auth even though the external input contract still accepts `?apiKey=`.
- The live browser request now uses `Authorization: Bearer ...`, not `x-api-key`.
- Generator-owned RPC files should get their bespoke metadata through `scripts/nearcore-operation-map.js`, not by hand, so the next `nearcore` regeneration preserves the slice.
- Synced REST/API files should not carry bespoke metadata directly; use `enhancements/<service>/manifest.yaml` plus generated page models instead.

## How To Extend This Pattern

For a new RPC endpoint, the best current path is:

1. Add a new `x-fastnear-interaction` kind to the target leaf spec.
2. Add or generate the corresponding shared page model so `shared/FastnearOperationPage.tsx` can render it.
3. Keep spec-derived defaults whenever possible.
4. Reuse `shared/portalAuth.ts` instead of inventing new auth state.
5. Verify both the pretty route and the operation route in a real browser.

## Good Candidates For Reuse

- network selection
- inline auth handling
- cURL generation style
- response panel shell
- shared request/response/schema renderer
- request-row portal strategy for full-width placement

The likely variable parts across future RPC endpoints are the request form, payload shaping, and response-specific presentation.

For REST/API endpoints, the likely variable parts are parameter grouping, URL construction, and whether auth should stay contract-shaped or be normalized to bearer on the custom surface.
