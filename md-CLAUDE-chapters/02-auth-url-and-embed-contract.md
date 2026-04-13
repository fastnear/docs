# 02 Auth, URL Params, And Runtime Contract

This chapter is the canonical continuity note for browser auth, URL-driven configuration, and the contract between `builder-docs`, the standalone runtime, and the legacy Redocly path.

## Canonical Auth Precedence

The shared logic lives in `shared/portalAuth.ts`.

API key precedence:

1. `?apiKey=`
2. `fastnear:apiKey`
3. `fastnear_api_key` as a legacy fallback only

Bearer-token precedence:

1. `?token=`
2. `fastnear:bearer`

The direct runtime and the legacy Redocly path should stay aligned with this precedence.

## Stored Browser Keys

Current localStorage keys:

- canonical API key: `fastnear:apiKey`
- legacy fallback only: `fastnear_api_key`
- `fastnear:bearer`

The shared writer helpers now persist only the canonical API-key key. If an older `fastnear_api_key` value is present, the browser auth layer migrates it to `fastnear:apiKey` and removes the legacy key.

## Important Distinction: External Contract Vs Browser Transport

The external input contract still treats `?apiKey=` as the main URL-level way to provide an API key.

However, browser live requests should not send the credential on the request URL. During the `view_account` pilot, query-param auth caused preflight/CORS failures, while header-based auth worked. The current custom `view_account` surfaces send the credential as `Authorization: Bearer ...`.

That means:

- `?apiKey=` remains the input contract.
- The client translates that into the runtime's browser-safe header transport for actual fetches.
- Generated cURL should match the live-request behavior.

## Redocly `configure.ts`

The Redocly runtime reads auth and other query params in `@theme/ext/configure.ts`.

Important responsibilities:

- inject API key into query params and headers when the target supports it
- inject bearer auth when supported
- set env vars for code samples
- apply preset/path/query/header overrides for REST API embeddings
- log locally on localhost for debugging

For the legacy Redocly verification path, `configure.ts` is still the main request-shaping entry point.

## Shared Browser Reactivity

`usePortalAuth()` in `shared/portalAuth.ts` keeps auth state current by listening for:

- localStorage changes across tabs
- custom `fastnear:authchange` events in the same tab
- history changes through a patched `pushState` and `replaceState`
- `popstate`

This matters because:

- saving or clearing a key should update the current page immediately
- navigating between docs pages should re-evaluate URL overrides without a full reload

## Current UI Rules

### On the custom `view_account` pilot

- The inline API-key field is the real auth editor.
- `?apiKey=` makes the field read-only and shows that the URL is overriding saved browser auth.
- The pilot can save and clear browser API keys when no URL override is present.

### On the Redocly Security control

- The Security modal is documentation-only.
- It describes the OpenAPI security scheme.
- It is not the editable auth entry point for the pilot.

This distinction should stay explicit in the UI copy.

## URL Parameters In Active Use

### Auth and network

- `?apiKey=`
- `?token=`
- `?network=`

### REST request shaping

- `?preset=`
- `?path.<name>=`
- `?query.<name>=`
- `?header.<name>=`

### Visual behavior

- `?colorSchema=dark|light`
- legacy `?darkMode`

## Hosted Route Model

Public docs pages in `builder-docs` render directly from generated page models, so they do not depend on an iframe bridge to `mike-docs`.

The legacy Redocly path still reads auth and request-shaping state from the URL through `configure.ts`.
Hosted canonical pages can emit resize messages with `postMessage` when external consumers embed them.

## Regression Checklist

When auth-related code changes, verify all of the following:

- no auth present
- save API key into browser storage
- clear saved API key
- open with `?apiKey=...` and confirm it wins
- confirm URL override does not overwrite saved browser auth
- confirm copied cURL and live fetch use the same effective auth source
- confirm Redocly and standalone surfaces remain aligned
