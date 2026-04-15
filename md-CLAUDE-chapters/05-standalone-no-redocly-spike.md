# 05 Standalone No-Redocly Spike

This chapter documents the no-Redocly standalone page runtime that now lives inside this repo as a local verification surface.

## Goal

Answer one architectural question with a real artifact:

Can complete FastNEAR docs pages run without `@redocly/*` runtime code while preserving the existing auth and route contract?

For `view_account`, the answer is yes. The runtime now also serves the bespoke FastNEAR API `v1 public key lookup` pilot.

## Entry Points

### Dev

- `npm run standalone:dev`
- route: `http://127.0.0.1:4010/rpcs/account/view_account`
- also serves: `http://127.0.0.1:4010/apis/fastnear/v1/public_key_lookup`

### Build

- `npm run standalone:build`
- output: `standalone-dist/`

## Core Files

- `scripts/generate-page-models.js`
- `scripts/standalone-common.js`
- `scripts/standalone-dev.js`
- `scripts/standalone-build.js`
- `standalone/src/app.tsx`
- `standalone/src/standalonePage.css`
- `shared/portalAuth.ts`
- `shared/FastnearOperationPage.tsx`
- `shared/FastnearOperationReference.tsx`
- `shared/fastnearPageModel.ts`

## What The Standalone App Does

- reads bespoke page models generated from both RPC leaf specs and manifest-backed API leaf specs
- serves the same pretty route shape on a separate origin
- renders a full custom page with:
  - title and description
  - security summary
  - live interaction
  - request example/reference
  - response schema/details

## Hard Requirement: No Redocly Runtime Imports

The local verification runtime is intentionally guarded against accidental Redocly dependency.

`scripts/standalone-common.js` contains two protections:

- source import scanning for `@redocly/*`
- build-metafile scanning for bundled Redocly runtime inputs

This should remain a non-negotiable invariant for the spike.

## Contract Preservation

The standalone page preserves:

- `?apiKey=`
- `?network=`
- canonical browser storage key `fastnear:apiKey`
- legacy fallback key `fastnear_api_key` during migration

It shares auth logic with the Redocly pilot through `shared/portalAuth.ts`.

## Important Behavioral Detail

The standalone page preserves the external auth contract while sending the actual browser request as `Authorization: Bearer ...`. That keeps the public input contract stable while matching the preferred FastNEAR auth transport.

## What This Spike Proves

- We can build useful full-page docs experiences outside Redocly.
- We can derive a meaningful docs page directly from a leaf spec plus portal-owned metadata.
- The interaction layer is not what keeps us on Redocly.

## What This Spike Does Not Prove

- That replacing the whole Redocly portal is easy
- That we already have a general docs-platform substitute
- That every REST/API shape can be migrated with the same amount of effort

The remaining difficulty is now clearly in generic reference rendering, route generation, portal shell behavior, and cross-service docs-platform features.

One important follow-on result from the spike:

- the standalone request/response/schema renderer is now reused on the Redocly `view_account` route too
- that makes the current comparison cleaner, because both surfaces now share the same lower reference implementation

## If We Expand The Spike

The next meaningful steps would be:

1. broaden the manifest-backed custom-page model for more API endpoints
2. support more interaction kinds and parameter/body shapes
3. broaden the schema renderer to cover more OpenAPI features
4. compare maintenance cost against simply continuing to extend the Redocly pilot

## Companion Note

The shorter narrative summary lives in:

- `docs/no-redocly-view-account-spike.md`

Use this chapter for implementation continuity and the `docs/` note for the product/architecture summary.
