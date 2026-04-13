# 07 Build, Publish, And Troubleshooting

This chapter keeps the practical “how do I run this safely?” knowledge in one place.

## Main Commands

- `npm run preview`
- `npm run preview:fresh-examples`
- `npm run preview:headless`
- `npm run preview:portal`
- `npm run lint`
- `npm run build`
- `npm run verify:workspace`
- `npm run smoke:operations`
- `npm run standalone:dev`
- `npm run standalone:build`

## Redocly Project Rules

- Run preview and build commands from the `mike-docs` repo root.
- Do not use nested `.claude/worktrees/*` directories as Redocly project roots.
- `scripts/redocly-root-guard.js` exists to make this fail fast instead of failing mysteriously later.

## Sync And Validation Expectations

`npm run lint` is stronger than a pure linter name implies. It currently does all of the following:

- checks external aggregate OpenAPI freshness in sibling repos when available
- syncs vendored REST specs into `apis/<service>/`
- regenerates enhancement bundles and operation-route helpers
- validates the Redocly project

This means `lint` can modify generated files. That is expected.

## Headless Vs Portal Mode

`scripts/toggle-headless.js` edits `redocly.yaml` in place to show or hide portal chrome.

Use:

- `preview:headless` for iframe-style work
- `preview:portal` for full portal context

After switching modes, check `git diff` if you are surprised by config changes.

## Build Credentials

- `PLAN_GATES` is the production-equivalent entitlement for `realm build`
- `REDOCLY_AUTHORIZATION` is not a substitute for `PLAN_GATES`
- local fallback can use `REDOCLY_LOCAL_PLAN=enterprise` or `pro`

## Production 404 Rule

If production still 404s after the code is merged or pushed, do not assume the repo is wrong. A common missing step is that the deployed Redocly project has not published the revision yet.

Useful mental model:

- GitHub state is not the same thing as deployed Redocly state.

## Current High-Value Troubleshooting Paths

### Route exists locally but not in production

- confirm the route locally with preview
- confirm the route is represented in config and generated route helpers
- confirm the deployed Redocly project has actually published the revision

### REST leaf files look wrong after editing

- check whether `scripts/sync-external-apis.js` overwrote a vendored file
- move the intended change to the upstream service repo or the enhancements manifest if it is docs-only

### RPC leaf file changed unexpectedly

- check whether the nearcore generator or operation map should own the change

### Browser behavior differs from lint/build

- run a real browser pass
- inspect network, localStorage, and console output
- compare both the Redocly route and the standalone route if the behavior is shared

## Suggested Maintenance Habit

Any time a bug takes more than one pass to diagnose, add the missing rule to one of these chapters while the reasoning is still fresh.
