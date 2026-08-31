# 06 REST Enhancements And Preset Injection

This chapter covers the portal-owned layer that shapes REST API Try-It behavior without changing upstream OpenAPI contracts.

## Why This Layer Exists

The OpenAPI specs remain contract truth, but the docs sometimes need runtime-specific defaults or preset-driven values that should not be baked into the contract itself.

That is what the enhancements layer is for.

## Source Files

- `enhancements/<service>/manifest.yaml`
- generated output: `shared/generatedEnhancements.ts`
- consumer: `@theme/ext/configure.ts`

## What Enhancements Can Do

Enhancement manifests currently drive interaction-only behavior such as:

- default preset selection
- network-aware values
- seeded path params
- seeded query params
- seeded headers
- seeded request bodies
- server hints for docs behavior

This lets the portal express docs and Try-It defaults without forking the actual API contract.

As of April 12, 2026, the bespoke REST page-model generator also consumes these manifests for custom pages, so network-aware path and query defaults stay aligned between:

- Redocly `configure()`-driven request seeding
- bespoke custom operation pages
- the standalone no-Redocly runtime

This is now exercised in two live service slices:

- `fastnear-api-server-rs` for `v1 public key lookup`
- `neardata-server` for `system/health` and the full block-family route set

## How `configure.ts` Uses Them

`configure.ts` combines several inputs:

- current pathname
- URL params such as `preset`, `network`, and explicit overrides
- service capabilities
- enhancement manifests
- portal auth state

It then returns Redocly `requestValues` for the active page.

## Important URL Inputs

- `?preset=`
- `?network=`
- `?path.<name>=`
- `?query.<name>=`
- `?header.<name>=`

These are especially important because the `builder-docs` to `mike-docs` integration is URL-only.

## `requestValues.body` Gotcha

When `configure.ts` sets `requestValues.body`, Redocly treats that as the active body example for the current MIME type. It does not merge recursively with existing named examples.

In practice:

- passing a partial JSON-RPC body is not enough
- the caller must supply the full request envelope

This is easy to forget and worth preserving in continuity docs.

## When To Use Enhancements Vs OpenAPI

Use enhancements when the behavior is docs-only:

- preset values
- network-aware defaults
- request seeding for authoring or UX
- bespoke custom-page defaults that should survive spec syncs

Use OpenAPI when the behavior is part of the actual API contract:

- schemas
- parameters
- security definitions
- response models
- `servers` — which endpoints genuinely serve the operation

The `servers` case is the one most easily got wrong, because it looks like a
docs knob. It is not. `servers:` declares where an operation *lives*, so it must
list every endpoint that genuinely serves it and nothing more. Which of those
endpoints a given docs *example* executes against is a property of the example,
not the API, and is therefore portal-owned: for RPC that is `ARCHIVAL_EXAMPLES`
in `scripts/rpc-example-config.js`. Encoding it in `servers:` instead tells every
spec consumer — SDK generators, MCP tools, agents — something false about the
method, and does not survive regeneration. See PORTAL_WORKFLOW.md → Archival
Examples.

Note that RPC operations cannot use enhancement manifests at all today: the RPC
and enhancement page-spec lists in `scripts/generate-page-models.js` are
disjoint, so `scripts/rpc-example-config.js` is the RPC-side equivalent.

## Future Continuity Need

If the repo moves farther toward custom interactions or standalone rendering, this chapter should likely grow into a cross-runtime request-shaping chapter rather than staying Redocly-specific.
