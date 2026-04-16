# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## What This Is

FastNEAR Docs Pipeline is the Redocly-side docs pipeline behind the current `builder-docs` iframe integration. It syncs vendored REST specs, generates per-operation RPC YAML, and serves the Redocly portal at https://fastnear.redocly.app.

The public docs UI lives in [builder-docs](https://github.com/fastnear/builder-docs). In this repo's current architecture phase, `builder-docs` embeds individual operation pages from this repo via iframes.

## Common Commands

```bash
npm run sync:apis              # Re-copy sibling REST specs into apis/<service>/
npm run preview                # Sync specs, refresh RPC examples, start preview on 127.0.0.1:4000
npm run preview:headless       # Hide portal chrome for iframe-style testing
npm run preview:portal         # Restore full sidebar/navbar portal chrome
npm run lint                   # Sync specs, then validate OpenAPI definitions
npm run build                  # Sync specs, then run the wrapped Reunite build
npm run smoke:operations       # Smoke test representative local pretty routes
npm run smoke:operations:prod  # Smoke test representative routes on fastnear.redocly.app
npm run generate-rpc           # Regenerate rpcs/*.yaml from nearcore OpenAPI
npm run refresh-examples       # Refresh tracked live RPC examples in rpcs/*.yaml
```

## Current Architecture

### RPC specs

- Each RPC method has its own YAML file under `rpcs/<category>/`.
- `rpcs/openapi.yaml` aggregates those files with `$ref`.
- `scripts/generate-from-nearcore.js` + `scripts/nearcore-operation-map.js` are the generator entrypoints.

### REST specs

- REST specs are vendored under `apis/<service>/`.
- The source of truth lives in sibling service repos under `../fn/*/openapi`.
- `scripts/sync-external-apis.js` refreshes the vendored copies.

### Redocly configure hook

`@theme/ext/configure.ts` is the central request-shaping hook for the Try-It console. It reads values such as:

- `?apiKey=`
- `?token=`
- `?body=`

and injects them into Redocly request state.

### builder-docs contract

`builder-docs` and `docs-pipeline` communicate through the iframe URL. There is no shared runtime state or `postMessage` contract for request shaping in this phase. Any new value that needs to reach the Try-It console must be added as a URL parameter and then read in `configure.ts`.

## Key Files

| File | Purpose |
|------|---------|
| `redocly.yaml` | Main portal config |
| `reference.page.yaml` | Single-operation route behavior |
| `sidebars.yaml` | Portal navigation |
| `@theme/ext/configure.ts` | Auth and body injection for Try-It |
| `scripts/sync-external-apis.js` | Sync sibling REST specs |
| `scripts/generate-from-nearcore.js` | Generate RPC YAML from nearcore |
| `scripts/refresh-examples.js` | Refresh tracked live RPC examples |
| `scripts/test-operations.js` | Smoke test representative pretty routes |
| [PORTAL_WORKFLOW.md](PORTAL_WORKFLOW.md) | Operational guide |
| [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md) | `builder-docs` iframe contract |
| [NETWORK_SYNC.md](NETWORK_SYNC.md) | Redocly environment/example sync notes |

## Development Notes

- Preview server default port: `4000`.
- `npm run preview` refreshes tracked live RPC examples, so diffs in `rpcs/*.yaml` can be expected.
- `scripts/toggle-headless.js` edits `redocly.yaml` in place.
- Do not hand-edit vendored files under `apis/<service>/`; sync commands overwrite them.
- `PLAN_GATES` is the production-equivalent entitlement for `realm build`; `REDOCLY_LOCAL_PLAN` is the local validation fallback.
- The external Redocly publish target is not encoded in this repo. If production is stale after a good local build, the missing step is usually publication of the Redocly project, not another local code change.
