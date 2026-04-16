# FastNEAR Docs Pipeline

Redocly-centric docs pipeline for FastNEAR RPC and REST API docs. This repo syncs upstream OpenAPI inputs, generates per-operation RPC YAML, and serves the Redocly portal that `builder-docs` embeds via iframes.

Deployed Redocly host: https://fastnear.redocly.app

## What Lives Here

```text
docs-pipeline/
├── rpcs/                       # Per-operation RPC YAML files (generated + hand-tuned)
│   └── openapi.yaml            # Aggregate RPC spec referencing all operation files
├── apis/                       # Vendored REST API specs from sibling service repos
│   ├── fastnear/
│   ├── transactions/
│   ├── transfers/
│   ├── kv-fastdata/
│   └── neardata/
├── @theme/ext/configure.ts     # Redocly configure() hook for auth + body injection
├── scripts/                    # Sync, preview, build, smoke, and generator scripts
├── redocly.yaml                # Portal configuration
├── sidebars.yaml               # Portal navigation
├── reference.page.yaml         # Single-operation route settings
├── PORTAL_WORKFLOW.md          # Day-to-day operational guide
├── INTEGRATION_GUIDE.md        # builder-docs iframe contract
├── API_DOCS_ROLLOUT.md         # Rollout tracker for this architecture phase
└── NETWORK_SYNC.md             # Technical notes on Redocly network/example syncing
```

## Common Commands

```bash
npm install

npm run sync:apis              # Re-copy sibling REST specs into apis/<service>/
npm run preview                # Sync specs, refresh RPC examples, start preview on 127.0.0.1:4000
npm run preview:headless       # Hide portal chrome for iframe-style local testing
npm run preview:portal         # Restore full sidebar/navbar portal chrome
npm run lint                   # Sync specs, then validate OpenAPI definitions
npm run build                  # Sync specs, then run the wrapped Reunite build
npm run smoke:operations       # Smoke test representative local pretty routes
npm run smoke:operations:prod  # Smoke test representative routes on fastnear.redocly.app
npm run generate-rpc           # Regenerate rpcs/*.yaml from nearcore's OpenAPI output
npm run refresh-examples       # Refresh tracked live RPC examples inside rpcs/*.yaml
```

The preview server runs on `http://127.0.0.1:4000`.

## Current Architecture

### Redocly-side pipeline

This repo is the Redocly-side docs pipeline behind the public docs experience:

- RPC specs are generated here from `nearcore`.
- REST specs are vendored here from sibling service repos.
- Redocly portal routes such as `/rpcs/account/view_account` and `/apis/fastnear/...` are served from here.
- Try-It request shaping is handled in `@theme/ext/configure.ts`.

### Relationship with `builder-docs`

The consumer-facing site is [`builder-docs`](https://github.com/fastnear/builder-docs). In this architecture phase it embeds individual operation pages from this repo via iframes.

```text
docs-pipeline (Redocly)         builder-docs (Docusaurus)
┌───────────────────────────┐   ┌───────────────────────────┐
│ /rpcs/... and /apis/...   │   │ Public docs pages         │
│ configure.ts              │◄──│ RpcRedoc / related embeds │
│ Try-It console            │   │ API key + body URL params │
└───────────────────────────┘   └───────────────────────────┘
```

The iframe URL is the integration contract. `builder-docs` passes values such as `?apiKey=`, `?token=`, `?body=`, and `?colorSchema=`; `configure.ts` reads them and pre-populates Redocly's Try-It console.

## REST Spec Ownership

The source of truth for vendored REST specs lives in sibling repos, not under `apis/<service>/`:

- `../fn/fastnear-api-server-rs/openapi`
- `../fn/explorer-api/openapi`
- `../fn/transfers-api/openapi`
- `../fn/kv-fastdata-server/openapi`
- `../fn/neardata-server/openapi`

Do not hand-edit the vendored copies under `apis/<service>/`; `npm run sync:apis`, `npm run preview`, `npm run lint`, and `npm run build` overwrite them.

## Generating RPC Specs from nearcore

The `rpcs/` YAML files come from a two-step generator pipeline:

```text
nearcore/chain/jsonrpc/openapi/openapi.json
    ↓
scripts/nearcore-operation-map.js
    ↓
scripts/generate-from-nearcore.js
    ↓
rpcs/<category>/<operation>.yaml
rpcs/openapi.yaml
```

### Add or update an RPC operation

1. Edit `scripts/nearcore-operation-map.js`.
2. Run `npm run generate-rpc`.
3. Review the generated YAML in `rpcs/<category>/`.
4. Run `npm run preview` or `npm run smoke:operations`.

Some operations are intentionally hand-written `custom` specs, such as `metrics` and `latest_block`, and the generator preserves them.

## Important Files

| File | Purpose |
|------|---------|
| `redocly.yaml` | Main Redocly portal config |
| `reference.page.yaml` | Single-operation route behavior |
| `sidebars.yaml` | Portal navigation |
| `@theme/ext/configure.ts` | Auth and request-body injection for Try-It |
| `scripts/sync-external-apis.js` | REST spec sync from sibling repos |
| `scripts/generate-from-nearcore.js` | nearcore RPC YAML generator |
| `scripts/refresh-examples.js` | Refresh tracked live RPC examples |
| `scripts/test-operations.js` | Smoke test representative operation routes |
| [PORTAL_WORKFLOW.md](PORTAL_WORKFLOW.md) | Operational workflow for this repo |
| [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md) | `builder-docs` iframe contract |
| [API_DOCS_ROLLOUT.md](API_DOCS_ROLLOUT.md) | Rollout tracker for this phase |
| [NETWORK_SYNC.md](NETWORK_SYNC.md) | Deep technical notes on Redocly environment syncing |

## Local Build Notes

`npm run build` prefers a real `PLAN_GATES` JWT for a production-equivalent Reunite build. For local validation you can create a `.env.redocly.local` file:

```bash
cp .env.redocly.local.example .env.redocly.local
```

Supported variables:

- `PLAN_GATES=<jwt>` for a production-equivalent build
- `REDOCLY_LOCAL_PLAN=enterprise` or `REDOCLY_LOCAL_PLAN=pro` for local-only validation
- `REDOCLY_AUTHORIZATION=<key>` for Redocly CLI/API auth when needed

`REDOCLY_AUTHORIZATION` does not replace `PLAN_GATES` for the real `realm build` path.

## Caveats

- `npm run preview` refreshes tracked live RPC examples inside `rpcs/*.yaml`, so diffs there can be expected.
- `scripts/toggle-headless.js` edits `redocly.yaml` in place.
- This repo validates and builds the Redocly portal, but it does not encode the external publish target.
- If production still 404s after a successful local build, the remaining gap is usually publication of the Redocly project rather than another local generation failure.

## Further Reading

- [PORTAL_WORKFLOW.md](PORTAL_WORKFLOW.md)
- [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md)
- [API_DOCS_ROLLOUT.md](API_DOCS_ROLLOUT.md)
- [NETWORK_SYNC.md](NETWORK_SYNC.md)
- [AGENTS.md](AGENTS.md)
- [CLAUDE.md](CLAUDE.md)
