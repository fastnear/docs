# 02 Auth, URL Params, And Runtime Contract

This chapter is the canonical continuity note for browser auth, URL-driven configuration, and the contract between `builder-docs` and the standalone runtime.

## Canonical Auth Precedence

The shared logic lives in `shared/portalAuth.ts`.

API key precedence:

1. `?apiKey=`
2. `fastnear:apiKey`
3. `fastnear_api_key` as a legacy fallback only

Bearer-token precedence:

1. `?token=`
2. `fastnear:bearer`

The direct runtime and the standalone verification runtime share this precedence.

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

## Hosted Route Model

Public docs pages in `builder-docs` render directly from generated page models, so they do not depend on an iframe bridge to `mike-docs`. Hosted canonical pages can emit resize messages with `postMessage` when external consumers embed them.

## Regression Checklist

When auth-related code changes, verify all of the following:

- no auth present
- save API key into browser storage
- clear saved API key
- open with `?apiKey=...` and confirm it wins
- confirm URL override does not overwrite saved browser auth
- confirm copied cURL and live fetch use the same effective auth source
- confirm the `builder-docs` direct runtime and the standalone runtime remain aligned
