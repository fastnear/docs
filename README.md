# FastNEAR RPC & API Documentation Portal

Redocly Reunite-based documentation portal for [FastNEAR](https://fastnear.com) RPC and REST API endpoints. Renders per-operation pages from OpenAPI YAML specs, with Try-It consoles and auto-generated code samples.

Deployed to: https://fastnear.redocly.app

## Repository Structure

```
mike-docs/
├── rpcs/                       # Per-operation YAML files (auto-generated + hand-tuned)
│   ├── openapi.yaml            # Aggregate spec referencing all operations
│   ├── account/                # 3 operations (view_account, view_access_key, view_access_key_list)
│   ├── block/                  # 3 operations (block_by_height, block_by_id, block_effects)
│   ├── contract/               # 5 operations (call, view_code, view_state, ...)
│   ├── protocol/               # 20 operations (status, health, gas_price, genesis_config, EXPERIMENTAL_*, ...)
│   ├── transaction/            # 6 operations (tx_status, send_tx, broadcast_tx_async, ...)
│   └── validators/             # 3 operations (validators_current, validators_by_epoch, ...)
├── apis/                       # REST API specs
│   └── openapi.yaml            # REST API spec (public key lookup endpoints)
├── @theme/
│   └── ext/
│       └── configure.ts        # Redocly extension — injects auth, body, and env vars into Try-It
├── scripts/
│   ├── generate-from-nearcore.js   # Generator: nearcore openapi.json → rpcs/*.yaml
│   ├── nearcore-operation-map.js   # Declarative mapping of nearcore paths → output files
│   ├── toggle-headless.js          # Switch between headless (embed) and portal (standalone) mode
│   ├── curl-postprocess.js          # Fixes curl samples: -i→-s, appends | jq, clipboard interception
│   ├── dark-mode.js                # Client-side dark mode toggle via ?darkMode param
│   └── test-operations.js          # Smoke test for operation page accessibility
├── docs/
│   └── snapshots.md            # Validator snapshot documentation
├── redocly.yaml                # Portal configuration (sidebar, navbar, APIs, display settings)
├── sidebars.yaml               # Navigation sidebar structure
├── reference.page.yaml         # Single-operation page settings (pagination: item)
└── package.json                # Scripts: preview, build, generate-rpc, lint
```

## Quick Start

```bash
npm install

# Preview in headless mode (for testing iframe embedding)
npm run preview:headless

# Preview in full portal mode (standalone with sidebar/navbar)
npm run preview:portal

# Preview with default settings
npm run preview
```

The preview server runs on http://127.0.0.1:4000 by default.

## Generating RPC Specs from nearcore

The `rpcs/` YAML files are generated from nearcore's OpenAPI spec using a two-part pipeline:

```
nearcore/chain/jsonrpc/openapi/openapi.json
    ↓
scripts/nearcore-operation-map.js    (declarative mapping: nearcore paths → output files)
    ↓
scripts/generate-from-nearcore.js    (reads map + spec, writes YAML files)
    ↓
rpcs/*.yaml                          (per-operation specs + aggregate openapi.yaml)
```

### Running the generator

```bash
# Default: reads from ../nearcore/chain/jsonrpc/openapi/openapi.json
npm run generate-rpc

# Or specify a custom path
node scripts/generate-from-nearcore.js /path/to/openapi.json
```

The generator:
- Reads the nearcore OpenAPI spec and the operation map
- Decomposes compound endpoints (e.g., `/query` → separate `view_account`, `view_code`, etc.)
- Produces self-contained per-operation YAML files under `rpcs/`
- Regenerates `rpcs/openapi.yaml` (aggregate spec with `$ref`s to all operations)
- Reports counts: created, updated, unchanged, skipped

### Adding a new RPC operation

1. Add an entry to the `OPERATIONS` array in `scripts/nearcore-operation-map.js`
2. Run `npm run generate-rpc`
3. Review the generated YAML under `rpcs/<category>/`
4. Preview with `npm run preview` to verify the page renders correctly

Some operations are `custom` type (not derived from nearcore), such as `metrics` and `latest_block`. These have hand-written YAML files that the generator preserves.

## Relationship with builder-docs

This repo is a **headless documentation backend**. The [builder-docs](https://github.com/fastnear/builder-docs) Docusaurus site embeds individual operation pages via iframes:

```
mike-docs (Redocly)                    builder-docs (Docusaurus)
┌────────────────────┐                 ┌────────────────────┐
│ rpcs/account/       │    iframe       │ docs/rpc-api/       │
│   view_account.yaml │ ◄──────────── │   view-account.mdx  │
│                     │                 │   (RpcRedoc component)│
│ @theme/ext/         │                 │                     │
│   configure.ts      │                 │ ApiKeyManager       │
│   (reads URL params │                 │   (localStorage →   │
│    → requestValues) │                 │    iframe URL params)│
└────────────────────┘                 └────────────────────┘
```

**Headless mode** (used for embedding): hides sidebar, navbar, breadcrumbs, and navigation buttons via `redocly.yaml` settings. Toggle with `npm run preview:headless` / `npm run preview:portal`.

The iframe URL is the full communication channel between the two sites. builder-docs constructs it with auth credentials and (optionally) a pre-populated request body, then mike-docs' `configure.ts` extension reads those params and feeds them to Redocly's Try-It console via `requestValues`.

## The `configure.ts` Extension Point

`@theme/ext/configure.ts` is Redocly's extension hook for customizing the Try-It console. It exports a `configure()` function that returns a `{ requestValues }` object. Redocly calls this on page load and uses the returned values to pre-populate headers, query params, security credentials, and the request body.

### URL Parameters

| Param | Type | Effect |
|-------|------|--------|
| `?apiKey=KEY` | string | Injected as `?apiKey=` query param, `x-api-key` header, security scheme values, and `{{API_KEY}}` code sample variable |
| `?token=TOKEN` | string | Injected as `Authorization: Bearer TOKEN` header, security scheme values, and `{{ACCESS_TOKEN}}` code sample variable |
| `?body=JSON` | URL-encoded JSON | Passed as `requestValues.body` — pre-populates the Try-It request body |
| `?darkMode` | flag | Activates dark mode (handled by `scripts/dark-mode.js`, not configure.ts) |

### Auth resolution order

1. **API key**: URL param `?apiKey=` > localStorage `fastnear:apiKey` > localStorage `fastnear_api_key`
2. **Bearer token**: URL param `?token=` > localStorage `fastnear:bearer`

When embedded in builder-docs, the `RpcRedoc` component reads keys from localStorage and passes them as URL params to the iframe, where `configure.ts` picks them up.

### Request body injection

The `?body=` parameter accepts a URL-encoded, complete JSON-RPC payload. When present, `configure.ts` parses it and passes it as `requestValues.body` to Redocly's Replay (Try-It) engine.

**Important**: `requestValues.body` is a **full replacement**, not a merge. Redocly's internal `convertRequestBody()` creates a single "default" example from the provided body, replacing any named examples (e.g., mainnet/testnet) defined in the YAML spec. This means builder-docs must pass the entire JSON-RPC envelope — `jsonrpc`, `id`, `method`, and `params` — not just the params.

Example URL:
```
/rpcs/block/block_by_height?body=%7B%22jsonrpc%22%3A%222.0%22%2C%22id%22%3A%22fastnear%22%2C%22method%22%3A%22block%22%2C%22params%22%3A%7B%22block_id%22%3A186464793%7D%7D
```

When `?body=` is absent, the YAML-defined named examples render as normal — fully backward compatible.

## Curl Sample Post-Processing

Redocly hardcodes `curl -i` in generated code samples with no config option to change it. `scripts/curl-postprocess.js` (loaded via `redocly.yaml` `scripts.head`) applies two fixes:

- **DOM**: Replaces `-i` with `-s` (silent mode) and appends `| jq` in the rendered code blocks. A `MutationObserver` re-applies these transforms when samples re-render (e.g., switching servers/examples).
- **Clipboard**: Intercepts the `copy` event to apply the same transforms when users click the copy button or Cmd+C selected curl text.

The clipboard interception uses a **capture-phase** event listener because Redocly's copy button uses the `copy-to-clipboard` package, which calls `stopPropagation()` on its internal copy handler — blocking standard bubbling listeners. The capture phase fires before the package's handler can suppress the event.

## URL Patterns

Operations are accessible at two URL formats:
- **Pretty routes**: `/rpcs/account/view_account` (file-based, matches the YAML file path)
- **Operation routes**: `/reference/operation/view_account` (generated by `reference.page.yaml` pagination)

Builder-docs currently uses the pretty route format for iframe embedding.

## Server Endpoints

Four RPC server URLs are configured in `rpcs/openapi.yaml`:
- `rpc.mainnet.fastnear.com`, `rpc.testnet.fastnear.com`
- `archival-rpc.mainnet.fastnear.com`, `archival-rpc.testnet.fastnear.com`

## Testing

- `test-embed.html` — Local HTML harness for testing iframe embedding behavior
- `INTEGRATION_GUIDE.md` — Reference doc for embedding operations in builder-docs
- `node scripts/test-operations.js` — Smoke test operation pages (run while preview is active)

## Other Commands

```bash
npm run build          # Build for production (Redocly Reunite)
npm run lint           # Validate OpenAPI specs
node scripts/test-operations.js   # Smoke test operation pages (run while preview is active)
```
