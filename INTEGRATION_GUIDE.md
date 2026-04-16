# Redocly Integration Guide for `builder-docs` and `docs-pipeline`

This document describes how the `builder-docs` Docusaurus site embeds Redocly operation pages from this repo via iframes, and how live blockchain data flows into the Redocly Try-It console.

## Architecture Overview

```text
builder-docs (Docusaurus)
  LiveRpcDoc / RpcRedoc
    ↓ builds iframe URL with ?apiKey=, ?token=, ?body=, ?colorSchema=
docs-pipeline (Redocly portal)
  @theme/ext/configure.ts
    ↓ reads URL params
  Redocly Try-It console
    ↓ pre-fills auth + request body
```

## URL Parameters

These are the query parameters that `builder-docs` passes to the iframe and that `configure.ts` reads:

| Parameter | Type | Description |
|-----------|------|-------------|
| `apiKey` | string | FastNEAR API key. Injected into query params, `x-api-key`, security schemes, and `{{API_KEY}}`. |
| `token` | string | Bearer token. Injected into `Authorization: Bearer`, security schemes, and `{{ACCESS_TOKEN}}`. |
| `body` | URL-encoded JSON string | Full JSON-RPC request payload. Parsed and set as `requestValues.body`. |
| `colorSchema` | `dark` or `light` | Theme hint read by the portal-side dark-mode helper. |
| `darkMode` | flag | Legacy alias for dark mode. |

### Priority rules

API key resolution:

1. `?apiKey=`
2. `localStorage["fastnear:apiKey"]`
3. `localStorage["fastnear_api_key"]`

Bearer token resolution:

1. `?token=`
2. `localStorage["fastnear:bearer"]`

### Body behavior

- When `?body=` is present and valid JSON, the Try-It console shows that value as a single default example.
- That value replaces the named YAML examples for the active request body.
- Invalid JSON is ignored and the console falls back to the YAML-defined examples.

Important: `requestValues.body` is a full replacement, not a merge. `builder-docs` must pass the entire JSON-RPC envelope, not only the `params` object.

## Live Data Flow from `builder-docs`

`builder-docs` fetches live blockchain data client-side and uses it to build request payloads for certain RPC docs pages.

Typical flow:

1. A page such as `block-by-height` resolves a live block height.
2. `builder-docs` builds a full JSON-RPC payload.
3. The iframe URL is built with `?body=<encoded-json>`.
4. `configure.ts` parses the payload and sets `requestValues.body`.
5. Redocly Try-It renders the pre-filled body.

If the required live values are unavailable, the iframe falls back to the static YAML examples.

## Local Verification

### 1. Start docs-pipeline preview

```bash
npm run preview:headless
```

This runs the Redocly preview on `http://127.0.0.1:4000`.

### 2. Start `builder-docs`

```bash
yarn start
```

On localhost, `builder-docs` can point embeds at `http://127.0.0.1:4000` instead of the production Redocly URL.

### 3. Verify the integration

Check one of the RPC pages that uses live request shaping and confirm:

- the iframe `src` includes the expected query params
- the Try-It console shows the injected body instead of the default YAML example
- requests succeed against the selected network

You can also use [test-embed.html](test-embed.html) for a minimal local embed harness.

## Files To Know

### In `docs-pipeline`

| File | Purpose |
|------|---------|
| `@theme/ext/configure.ts` | Reads iframe URL params and returns `requestValues` |
| `redocly.yaml` | Portal configuration |
| `reference.page.yaml` | Enables `/reference/operation/...` routes |
| `scripts/toggle-headless.js` | Switches full-portal vs iframe-style preview |
| `test-embed.html` | Minimal local embed harness |

### In `builder-docs`

These are the components typically involved in this integration phase:

| Area | Purpose |
|------|---------|
| `LiveRpcDoc` | Builds live JSON-RPC bodies for selected pages |
| `RpcRedoc` | Builds the iframe URL |
| `ApiKeyManager` | Stores API keys in localStorage |

## Known Constraints

- Communication is URL-only. There is no shared-state or `postMessage` request-shaping layer between the repos in this phase.
- Large request bodies can exceed comfortable URL lengths, especially transaction-submission payloads.
- Any new value that needs to flow from `builder-docs` into the Try-It console must be expressed as a URL parameter and then read in `configure.ts`.
- Production behavior depends on the published Redocly project, not only on the local build output in this repo.
