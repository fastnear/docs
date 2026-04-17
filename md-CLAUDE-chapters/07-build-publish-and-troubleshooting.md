# 07 Build, Publish, And Troubleshooting

This chapter keeps the practical "how do I run this safely?" knowledge in one place.

## Main Commands

- `npm run lint`
- `npm run standalone:dev`
- `npm run standalone:build`
- `npm run verify:workspace`
- `npm run smoke:operations`

## Sync And Validation Expectations

`npm run lint` is stronger than a pure linter name implies. It currently does all of the following:

- checks external aggregate OpenAPI freshness in sibling repos when available
- syncs vendored REST specs into `apis/<service>/`
- regenerates enhancement bundles, page-model artifacts, and the structured graph

This means `lint` can modify generated files. That is expected.

OpenAPI validation itself now lives in each owning service repo (`cargo run --features openapi --bin generate-openapi -- --check`) rather than a separate portal-side lint step. That check is exercised by `scripts/check-external-openapi.js` when the sibling workspace is present.

## Verify Gate

`npm run verify:workspace` runs `lint`, `standalone:build`, and 12 audits. Prefer it as the single CI gate; every other audit script exists so you can iterate on one slice without running the whole chain.

## Production 404 Rule

If production still 404s after the code is merged or pushed, do not assume this repo is wrong. The common missing step is that the deployed `builder-docs` site has not published the revision yet.

Useful mental model:

- GitHub state is not the same thing as deployed docs state.

## Current High-Value Troubleshooting Paths

### Route exists locally but not in production

- confirm the route locally with `npm run standalone:dev` and a browser at `http://127.0.0.1:4010/<route>`
- confirm the page model exists in `shared/generatedFastnearPageModels.json`
- confirm the vendored copy in `builder-docs/src/data/generatedFastnearPageModels.json` matches
- confirm the deployed `builder-docs` site has actually published the revision

### REST leaf files look wrong after editing

- check whether `scripts/sync-external-apis.js` overwrote a vendored file
- move the intended change to the upstream service repo or the enhancements manifest if it is docs-only

### RPC leaf file changed unexpectedly

- check whether the nearcore generator or operation map should own the change

### Browser behavior differs from lint/build

- run a real browser pass against `npm run standalone:dev`
- inspect network, localStorage, and console output

## Suggested Maintenance Habit

Any time a bug takes more than one pass to diagnose, add the missing rule to one of these chapters while the reasoning is still fresh.
