# 06 REST Enhancements And Preset Injection

This chapter covers the portal-owned layer that shapes REST API Try-It behavior without changing upstream OpenAPI contracts.

## Why This Layer Exists

The OpenAPI specs remain contract truth, but the docs sometimes need runtime-specific defaults or preset-driven values that should not be baked into the contract itself.

That is what the enhancements layer is for.

## Source Files

- `enhancements/<service>/manifest.yaml`
- generated output: `shared/generatedEnhancements.ts`
- consumers: `scripts/generate-page-models.js` (builds the generated page-model registry that `builder-docs` and the standalone runtime consume)

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

The bespoke page-model generator consumes these manifests for custom pages, so network-aware path and query defaults flow through to:

- the direct-render runtime in `builder-docs`
- the standalone verification runtime in this repo

## Important URL Inputs

- `?preset=`
- `?network=`
- `?path.<name>=`
- `?query.<name>=`
- `?header.<name>=`

These are especially important because the `builder-docs` to `mike-docs` integration is URL-only.

## Request Body Gotcha

When a manifest or URL override supplies a full request body, the runtime treats it as the active body example for the current MIME type — it does not merge recursively with existing named examples. In practice, callers must supply the full JSON-RPC envelope (or the complete REST body), not just the params or the fields they want to override.

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

