# API Docs Rollout Tracker

This file is the source of truth for the multi-repo API docs rollout.

## Locked Decisions

- Specs are owned in the service repos and vendored into `mike-docs`.
- Redocly namespaces are split per service:
  - `apis/fastnear`
  - `apis/transactions`
  - `apis/transfers`
  - `apis/kv-fastdata`
  - `apis/neardata`
- Builder docs use one page per operation with iframe embeds.
- `fastdata-indexer` is documented as architecture and data lineage only, not as an OpenAPI surface.
- Phase 1 excludes `fastnear-api-server-rs` experimental `/exp/*` routes.

## Service Mapping

| Repo | Public docs namespace | Notes |
| --- | --- | --- |
| `fastnear-api-server-rs` | `fastnear` | Mainnet + testnet indexed account/token APIs |
| `explorer-api` | `transactions` | Public transactions/receipts/blocks API |
| `transfers-api` | `transfers` | Account-centric transfer history API |
| `kv-fastdata-server` | `kv-fastdata` | FastData key-value query API |
| `neardata-server` | `neardata` | Cached/archive NEAR block data API |
| `fastdata-indexer` | n/a | Architecture docs only |

## Rollout Status

| Repo | Inventory complete | Spec source chosen | Spec authored/generated | Synced into `mike-docs` | Redocly lint green | Builder-docs pages added | Manual smoke test done |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `transfers-api` | yes | yes | yes | yes | yes | yes | yes |
| `explorer-api` | yes | yes | yes | yes | yes | yes | yes |
| `fastnear-api-server-rs` | yes | yes | yes | yes | yes | yes | yes |
| `kv-fastdata-server` | yes | yes | yes | yes | yes | yes | yes |
| `neardata-server` | yes | yes | yes | yes | yes | yes | yes |
| `fastdata-indexer` | yes | yes | yes | n/a | n/a | yes | yes |

## Validation Notes

- `npm run lint` is green in `/Users/mikepurvis/near/mike-docs`.
- `REDOCLY_LOCAL_PLAN=enterprise npm run build` is green in `/Users/mikepurvis/near/mike-docs`; the local static build now completes end-to-end.
- `yarn build` is green in `/Users/mikepurvis/near/fn/builder-docs`.
- Preview smoke coverage now lives in `npm run smoke:operations` for representative RPC and API pretty routes.
- Production smoke coverage now lives in `npm run smoke:operations:prod` against `https://fastnear.redocly.app`.
- `npm run build` in `mike-docs` now prefers `PLAN_GATES` from the shell environment or `.env.redocly.local`, with a local-only fallback via `REDOCLY_LOCAL_PLAN=enterprise|pro` for developer validation.
- GitHub Actions parity now lives in `.github/workflows/portal-build.yml` and runs `npm ci`, `npm run lint`, and `npm run build` on pull requests, pushes to `main`, and manual dispatches.
- As of April 10, 2026, production still returns Redocly 404 payloads for the new `/apis/<service>/...` routes while the local `public/page-data/apis/...` build output contains them. That means the remaining gap is publication of this rollout to the deployed Redocly project, not another local build failure.
