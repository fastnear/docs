# Portal Workflow

This document is the operational guide for working on the FastNEAR Redocly portal in this repo.

## What Lives Where

- `rpcs/` is owned here and generated from `../nearcore`.
- `apis/<service>/` is vendored here, but owned in sibling service repos:
  - `../fn/fastnear-api-server-rs/openapi`
  - `../fn/explorer-api/openapi`
  - `../fn/transfers-api/openapi`
  - `../fn/kv-fastdata-server/openapi`
  - `../fn/neardata-server/openapi`
- `builder-docs` embeds the pretty routes from this portal via iframe.

## The Normal Workflow

1. Edit the source-of-truth spec in the owning repo.
2. Run `npm run preview`, `npm run lint`, or `npm run build` in this repo.
3. Those commands resync `apis/<service>/` automatically before they continue.
4. Verify routes locally:
   - `npm run smoke:operations`
   - open [`test-embed.html`](/Users/mikepurvis/near/mike-docs/test-embed.html)
5. Push the changes in this repo.
6. Verify production:
   - `npm run smoke:operations:prod`

## Local Environment

Create a local Redocly env file if you want static builds:

```bash
cp .env.redocly.local.example .env.redocly.local
```

Supported variables:

- `PLAN_GATES=<jwt>` for a production-equivalent Reunite build.
- `REDOCLY_LOCAL_PLAN=enterprise` or `REDOCLY_LOCAL_PLAN=pro` for local-only validation builds.

`REDOCLY_AUTHORIZATION` is a different credential. It can help with Redocly API/CLI auth, but it does not replace `PLAN_GATES` for the real `realm build` entitlement flow.

## Commands

- `npm run sync:apis`
  Re-copy all service-owned `openapi/` trees into `apis/<service>/`.
- `npm run preview`
  Syncs REST specs, refreshes RPC examples, then starts Redocly preview.
- `npm run preview:headless`
  Same as preview, but hides portal chrome for iframe embedding.
- `npm run preview:portal`
  Same as preview, but restores full portal chrome.
- `npm run lint`
  Syncs REST specs, then validates all OpenAPI definitions.
- `npm run build`
  Syncs REST specs, then runs the wrapped Reunite build.
- `npm run smoke:operations`
  Smoke-tests representative local pretty routes.
- `npm run smoke:operations:prod`
  Smoke-tests representative routes on `https://fastnear.redocly.app`.

## What Will Not Work

- Hand-editing vendored files under `apis/<service>/` is not durable.
  `npm run sync:apis`, `npm run preview`, `npm run lint`, and `npm run build` overwrite them from the owning service repo.
- `REDOCLY_AUTHORIZATION` alone will not unlock a production-equivalent build.
  Use `PLAN_GATES` for that path, or `REDOCLY_LOCAL_PLAN` for local validation.
- Pushing to GitHub does not guarantee the public site updates immediately.
  If production still returns 404s for new `/apis/<service>/...` routes, the deployed Redocly project has not published this revision yet.
- This repo does not encode the Redocly publish target.
  CI validates and uploads the static `public/` artifact, but org/project/mount-path live outside this repo.
- `npm run preview` and local builds mutate RPC example values.
  `scripts/refresh-examples.js` fetches fresh chain data and updates several `rpcs/*.yaml` files with current block, chunk, tx, and receipt examples.
- `scripts/toggle-headless.js` edits `redocly.yaml` in place.
  If chrome visibility looks wrong, check `git diff`.
- `fastdata-indexer` is intentionally not an OpenAPI surface in this phase.
  It is documented in builder-docs as architecture and data lineage only.

## Production Verification

When rollout changes are published correctly:

- RPC pretty routes should return `200`.
- API pretty routes like `/apis/fastnear/v1/account_full` should return `200`.
- `npm run smoke:operations:prod` should be fully green.

If RPC routes work but new API routes return 404:

- the local build is probably fine,
- the generated `public/page-data/apis/...` output is probably present,
- and the missing step is publication of the updated portal to the deployed Redocly project.
