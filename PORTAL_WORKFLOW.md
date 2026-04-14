# Portal Workflow

This document is the operational guide for working on the FastNEAR generation pipeline and legacy Redocly runtime in this repo.

If you are adding a brand-new REST API service, pair this guide with [SERVICE_ONBOARDING_CHECKLIST.md](SERVICE_ONBOARDING_CHECKLIST.md).

## What Lives Where

- `rpcs/` is owned here and generated from `../nearcore`.
- `apis/<service>/` is vendored here, but owned in sibling service repos:
  - `../fn/fastnear-api-server-rs/openapi`
  - `../fn/explorer-api/openapi`
  - `../fn/transfers-api/openapi`
  - `../fn/kv-fastdata-server/openapi`
  - `../fn/neardata-server/openapi`
- `enhancements/<service>/manifest.yaml` is owned here for the portal-side docs enhancement layer.
- `builder-docs` vendors generated page models from this repo and renders the public docs pages directly.

## The Normal Workflow

1. Edit the source-of-truth spec in the owning repo.
2. Edit `enhancements/<service>/manifest.yaml` in this repo when an operation needs portal-side preset or interaction behavior.
3. Run `npm run check:external-openapi` in this repo when the sibling service repos are available.
4. Run `npm run preview`, `npm run lint`, or `npm run build` in this repo.
5. Those commands resync the aggregate specs, regenerate `apis/<service>/` leaf files, regenerate the shared enhancement bundle, and refresh the generated page-model artifacts automatically before they continue.
6. Verify routes locally:
   - `npm run smoke:operations`
   - `npm run standalone:build`
7. Push the changes in this repo or through the existing Redocly-connected publish path.

## Local Environment

Local Redocly policy:

- The `mike-docs` repo root is the only supported local Redocly project.
- Do not use `.claude/worktrees/*` as a portal preview source.
- If you see broken-link diagnostics referencing `.claude/worktrees/...`, you are looking at a stale nested worktree copy rather than the current root config.

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
  Sync all service-owned aggregate specs into `apis/<service>/`, split them into per-operation leaf files, and rebuild the generated enhancements and page-model artifacts.
- `npm run check:external-openapi`
  Run `cargo run --features openapi --bin generate-openapi -- --check` across sibling service repos when the workspace is present.
- `npm run preview`
  Syncs REST specs, verifies you are running from the repo root, rejects stale nested `.claude/worktrees/*` Redocly configs, then starts Redocly preview without mutating tracked RPC examples.
- `npm run preview:fresh-examples`
  Syncs REST specs, refreshes tracked RPC examples, then applies the same root-only Redocly preview guard.
- `npm run lint`
  Syncs REST specs, prints the authoritative Redocly project/config, warns about stale nested `.claude/worktrees/*` Redocly configs, then validates all OpenAPI definitions.
- `npm run build`
  Syncs REST specs, prints the authoritative Redocly project/config, warns about stale nested `.claude/worktrees/*` Redocly configs, then runs the wrapped Reunite build without mutating tracked RPC examples.
- `npm run build:fresh-examples`
  Syncs REST specs, refreshes tracked RPC examples, then runs the wrapped Reunite build.
- `npm run verify:workspace`
  Run the stale-spec check, portal lint, and a local static build in one command.
- `npm run smoke:operations`
  Smoke-tests representative local pretty routes.

## What Will Not Work

- Hand-editing vendored files under `apis/<service>/` is not durable.
  `npm run sync:apis`, `npm run preview`, `npm run lint`, and `npm run build` overwrite them from the owning service repo.
- Hand-editing `shared/generatedEnhancements.ts` is not durable.
  Update the portal-owned manifest at `enhancements/<service>/manifest.yaml` instead.
- `npm run check:external-openapi` is workspace-aware, not standalone-repo magic.
  It expects the sibling service repos; when those are absent, it skips and the portal validates the committed vendored `apis/<service>/` trees instead.
- `REDOCLY_AUTHORIZATION` alone will not unlock a production-equivalent build.
  Use `PLAN_GATES` for that path, or `REDOCLY_LOCAL_PLAN` for local validation.
- Pushing to GitHub does not guarantee the public site updates immediately.
  If production still returns stale pages, the missing step is often a `builder-docs` publish rather than a problem in this repo.
- This repo does not encode the Redocly publish target.
  CI validates and uploads the static `public/` artifact, but org/project/mount-path live outside this repo.
- `npm run preview:fresh-examples`, `npm run refresh-examples`, and `npm run build:fresh-examples` mutate tracked RPC example values.
  `scripts/refresh-examples.js` fetches fresh chain data and updates several `rpcs/*.yaml` files with current block, chunk, tx, and receipt examples.
- Nested `.claude/worktrees/*` Redocly configs are not supported preview targets.
  Preview commands now fail fast when they detect those stale worktree copies so they cannot confuse local QA.
- `server=` is currently only a docs-enhancement hint, not a forced Redocly server switch.
  The portal can seed preset values and env vars from `preset`/`network`/`server`, but Redocly does not currently expose a clean URL-level API for selecting the server dropdown directly.
- Docs-only or ingestion-only repos without a public HTTP surface are intentionally out of scope for this OpenAPI flow.

## Production Verification

When rollout changes are published correctly:

- `builder-docs` should serve fresh canonical `/rpcs/...` and `/apis/...` pages.
- the local build is probably fine,
- the generated `public/page-data/apis/...` output is probably present,
- and the missing step is usually publication of the updated public site from `builder-docs`.
