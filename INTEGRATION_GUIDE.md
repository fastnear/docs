# Redocly Integration Guide for builder-docs

This document describes how the builder-docs Docusaurus site (https://github.com/fastnear/builder-docs) embeds Redocly operation pages from this repo (mike-docs) via iframes, and how live blockchain data flows from the Docusaurus frontend into the Redocly Try-It console.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  builder-docs (Docusaurus)                                          │
│                                                                     │
│  useLatestBlock hook                                                │
│    ├─ fetches latest finalized block from rpc.mainnet.fastnear.com  │
│    ├─ walks recent chunks to find a transaction                     │
│    └─ returns: { height, hash, chunks[], txHash, sender, receiptId }│
│                              │                                      │
│  LiveRpcDoc component        │                                      │
│    ├─ renders LatestBlockBanner (copy-to-clipboard UI)              │
│    ├─ builds JSON-RPC body from live data + rpcParams template      │
│    └─ passes body to RpcRedoc                                       │
│                              │                                      │
│  RpcRedoc component          │                                      │
│    └─ builds iframe URL:     ▼                                      │
│       https://fastnear.redocly.app/rpcs/block/block_by_height       │
│         ?apiKey=USER_KEY                                            │
│         &body={"jsonrpc":"2.0","id":"fastnear","method":"block",    │
│                "params":{"block_id":186464813}}                     │
└─────────────────────┬───────────────────────────────────────────────┘
                      │ iframe src
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│  mike-docs (Redocly portal)                                         │
│                                                                     │
│  @theme/ext/configure.ts                                            │
│    ├─ reads ?apiKey from URL → injects into query, headers, security│
│    ├─ reads ?token from URL  → injects into Authorization header    │
│    └─ reads ?body from URL   → JSON.parse → sets requestValues.body │
│                                                                     │
│  Redocly Try-It console                                             │
│    └─ receives requestValues.body → pre-fills the request editor    │
│       (replaces named YAML examples with the passed body)           │
└─────────────────────────────────────────────────────────────────────┘
```

## URL Parameters (the contract)

These are the URL query parameters that builder-docs passes to the iframe, and that `configure.ts` reads:

| Parameter | Type | Description |
|-----------|------|-------------|
| `apiKey` | string | FastNEAR API key. Injected into query params, `x-api-key` header, security schemes, and `{{API_KEY}}` env variable. |
| `token` | string | Bearer token. Injected into `Authorization: Bearer` header, security schemes, and `{{ACCESS_TOKEN}}` env variable. |
| `body` | URL-encoded JSON string | Full JSON-RPC request payload. Parsed and set as `requestValues.body`, which **replaces** named YAML examples in the Try-It console. |

### Priority for apiKey

1. `?apiKey=` URL parameter (set by RpcRedoc)
2. `localStorage["fastnear:apiKey"]` (new canonical key)
3. `localStorage["fastnear_api_key"]` (legacy key, still checked for backwards compat)

### Priority for token

1. `?token=` URL parameter (set by RpcRedoc)
2. `localStorage["fastnear:bearer"]`

### Body behavior

- When `?body=` is present and valid JSON: Try-It console shows the passed body as a single "default" example, **replacing** the named mainnet/testnet examples.
- When `?body=` is absent: behavior is unchanged — YAML examples appear as normal.
- Invalid JSON in `?body=` is silently ignored (no error, falls back to YAML examples).
- Parameters combine freely: `?body=...&apiKey=...&token=...`

## Live Data: What builder-docs sends

The `useLatestBlock` hook in builder-docs fetches live blockchain data and makes it available to every RPC endpoint page. The data returned:

```js
{
  height: 186464813,                             // number — latest finalized block height
  hash: "7diVPShPsSJsa7u3J6XSvbHitDEP32izJGmZLZX66AeZ", // string — block hash (base58)
  chunks: [
    { chunkHash: "CrdE2i...", shardId: 0 },      // chunk data per shard
    { chunkHash: "Xk3jF9...", shardId: 1 },
    ...
  ],
  txHash: "4KrMQxw...",                          // string|null — recent tx hash (base58)
  sender: "alice.near",                           // string|null — tx signer account
  receiptId: "8bZr1c...",                         // string|null — first receipt from that tx
}
```

This data is cached client-side for 60 seconds (module-level cache shared across page navigations).

The tx fields (`txHash`, `sender`, `receiptId`) are found by walking backwards through recent blocks and checking chunk transactions. They may be `null` if no transaction is found in the last 20 blocks. When any required param resolves to `null`, the body is **not** sent — the iframe falls back to YAML examples.

## Body Templates: How LiveRpcDoc builds the JSON-RPC payload

Each MDX page declares a `rpcMethod` and `rpcParams` template. The `LiveRpcDoc` component resolves template values against live data:

```jsx
// In an MDX page (e.g., block-by-height.mdx):
<LiveRpcDoc
  fields={['height']}
  rpcMethod="block"
  rpcParams={{ block_id: 'height' }}
  path="/rpcs/block/block_by_height"
/>
```

**Resolution rules:**
- Values matching a known data field name (`height`, `hash`, `chunkHash`, `shardId`, `txHash`, `sender`, `receiptId`) are replaced with live data.
- All other values pass through as **literals** (e.g., `'FINAL'`, `'receipt'`).

The resolved body for the example above:
```json
{
  "jsonrpc": "2.0",
  "id": "fastnear",
  "method": "block",
  "params": { "block_id": 186464813 }
}
```

## Complete Mapping: All endpoint pages with auto-fill

| MDX Page | rpcMethod | rpcParams (template) | Resolved body params |
|----------|-----------|---------------------|---------------------|
| block-by-height | `block` | `{ block_id: 'height' }` | `{ block_id: 186464813 }` |
| block-by-id | `block` | `{ block_id: 'hash' }` | `{ block_id: "7diVPS..." }` |
| block-effects | `block_effects` | `{ block_id: 'height' }` | `{ block_id: 186464813 }` |
| gas-price-by-block | `gas_price` | `{ block_id: 'height' }` | `{ block_id: 186464813 }` |
| chunk-by-hash | `chunk` | `{ chunk_id: 'chunkHash' }` | `{ chunk_id: "CrdE2i..." }` |
| chunk-by-block-shard | `chunk` | `{ block_id: 'height', shard_id: 'shardId' }` | `{ block_id: 186464813, shard_id: 0 }` |
| tx-status | `tx` | `{ tx_hash: 'txHash', sender_account_id: 'sender', wait_until: 'FINAL' }` | `{ tx_hash: "4KrMQx...", sender_account_id: "alice.near", wait_until: "FINAL" }` |
| experimental-tx-status | `EXPERIMENTAL_tx_status` | (same as tx-status) | (same) |
| experimental-receipt | `EXPERIMENTAL_receipt` | `{ receipt_id: 'receiptId' }` | `{ receipt_id: "8bZr1c..." }` |
| next-light-client-block | `next_light_client_block` | `{ last_block_hash: 'hash' }` | `{ last_block_hash: "7diVPS..." }` |
| light-client-proof | `light_client_proof` | `{ light_client_head: 'hash', type: 'receipt', transaction_hash: 'txHash', sender_id: 'sender' }` | `{ light_client_head: "7diVPS...", type: "receipt", ... }` |
| exp-light-client-block-proof | `EXPERIMENTAL_light_client_block_proof` | `{ block_hash: 'hash', light_client_head: 'hash' }` | `{ block_hash: "7diVPS...", light_client_head: "7diVPS..." }` |
| exp-light-client-proof | `EXPERIMENTAL_light_client_proof` | (same as light-client-proof) | (same) |
| experimental-protocol-config | `EXPERIMENTAL_protocol_config` | `{ finality: 'final' }` | `{ finality: "final" }` |
| changes | *(no auto-fill)* | — | Falls back to YAML examples |

## What configure.ts must do (current implementation)

The `@theme/ext/configure.ts` file currently handles all three URL parameters correctly. Here is the critical section:

```typescript
// Read body from URL param (full JSON-RPC payload, URL-encoded)
const bodyParam = search.get("body");
if (bodyParam) {
  try {
    rv.body = JSON.parse(bodyParam);
  } catch { /* invalid JSON, ignore */ }
}
```

Setting `rv.body` on the returned `requestValues` causes Redocly's Try-It console to use that object as the request body, replacing named examples.

**Important:** The `RequestValues` type must include `body?: any`. The current configure.ts already has this.

## Pages that do NOT use auto-fill

These pages use plain `RpcRedoc` (no banner, no body injection):
- All account pages (view-account, view-access-key, view-access-key-list)
- All contract pages (call-function, view-code, view-state, etc.)
- Transaction broadcast pages (broadcast-tx-async, broadcast-tx-commit, send-tx)
- Protocol pages with no block params (latest-block, gas-price, status, health, network-info, genesis-config, etc.)
- Validator pages

The `changes` page has a banner (for copy-paste of block height/hash) but no auto-fill because the `EXPERIMENTAL_changes` endpoint requires complex type-specific params that can't be meaningfully constructed from block data alone.

## Quick Start: Preview & Test

### 1. Start the Redocly preview

```bash
# In mike-docs:
npm run preview:headless
# Runs on http://127.0.0.1:4000
```

### 2. Start builder-docs

```bash
# In builder-docs:
yarn start
# Runs on http://localhost:3000
```

builder-docs auto-detects localhost and redirects iframe src to `http://127.0.0.1:4000` instead of the production Redocly URL.

### 3. Verify auto-fill

1. Navigate to http://localhost:3000/docs/rpc-api/block/block-by-height
2. The banner should show a live block height with "Pre-filled in the Try-It console below."
3. The iframe's Try-It console should have a body like:
   ```json
   { "jsonrpc": "2.0", "id": "fastnear", "method": "block", "params": { "block_id": 186464813 } }
   ```
4. Click "Send" -- should return the block data.

### 4. Test without body (fallback)

Navigate to any account page (e.g., view-account) -- no banner, no body param. The iframe should show the standard YAML examples (mainnet/testnet toggle).

## URL Structure

### With `pagination: item` enabled (in reference.page.yaml):

- **Single operation**: `/reference/operation/view_account`
- **With API key**: `/reference/operation/view_account?apiKey=YOUR_KEY`
- **With dark mode**: `/reference/operation/view_account?darkMode`

### Pretty routes (current structure):

- **Account operations**: `/rpcs/account/view_account`
- **Block operations**: `/rpcs/block/block_by_height`
- **Transaction operations**: `/rpcs/transaction/tx_status`

## Files in this repo (mike-docs)

| File | Purpose |
|------|---------|
| `@theme/ext/configure.ts` | Auth + body injection -- reads URL params, returns `requestValues` |
| `redocly.yaml` | Portal config (headless mode for embedding) |
| `reference.page.yaml` | Enables single-operation pages with `pagination: item` |
| `test-embed.html` | Standalone test harness for iframe embedding |
| `scripts/toggle-headless.js` | Switch between embedded and portal modes |
| `rpcs/**/*.yaml` | Per-operation OpenAPI specs (auto-generated from nearcore) |

## Files in builder-docs

| File | Purpose |
|------|---------|
| `src/hooks/useLatestBlock.js` | React hook: fetches live block + tx data, 60s cache |
| `src/components/LiveRpcDoc/index.js` | Wrapper: banner + RpcRedoc with body auto-fill |
| `src/components/LatestBlockBanner/index.js` | Banner UI: displays live data with copy buttons |
| `src/components/RpcRedoc/index.js` | Core iframe component: builds URL with `?apiKey`, `?body` |
| `src/components/ApiKeyManager/index.js` | UI for managing API key in localStorage |
| `docs/rpc-api/**/*.mdx` | Individual endpoint pages using LiveRpcDoc or plain RpcRedoc |

## URL Length Considerations

Most operations produce compact bodies that encode well in URLs:

- **Query/read operations** (view_account, block queries, validators): 150-250 chars raw JSON, ~200-350 URL-encoded. Well within all limits.
- **Contract calls with `args_base64`** (call_function with 1KB+ args): can push toward 1,500 chars URL-encoded. Borderline for some older systems.
- **Transaction submission** (send_tx, broadcast_tx_commit): signed transactions can exceed 3,000+ chars URL-encoded, beyond typical browser URL limits (~2,083 chars in IE/Edge legacy).

**Recommendation:** Use `?body=` for query and read operations. For transaction submission, rely on the YAML-defined examples or consider alternative mechanisms.

## Security Notes

- `JSON.parse()` of URL input is safe -- no code execution risk. Invalid JSON is silently ignored (caught and logged on localhost).
- The `%7B`/`%7D` URL-encoded braces in `?body=` may trip aggressive URL sanitizers or WAF rules in some CDN/proxy configurations. If builder-docs runs behind such infrastructure, test with a real body param end-to-end.
- The body param does not introduce XSS risk: the parsed JSON is passed to Redocly's `requestValues.body` as data (populates the Try-It form), not as executable content.

## Debugging

### Check what builder-docs sends

In the browser on a builder-docs page, inspect the iframe element's `src` attribute. You should see:
```
https://fastnear.redocly.app/rpcs/block/block_by_height?apiKey=...&body=%7B%22jsonrpc%22%3A%222.0%22%2C...%7D
```

Decode the `body` param to verify the JSON-RPC payload.

### Check what configure.ts receives

On localhost, configure.ts logs to the browser console:
```
Redocly configure.ts - Request values configured: {
  hasApiKey: true,
  hasBearer: false,
  hasBody: true,
  queryParams: ["apiKey"],
  headers: ["x-api-key"]
}
```

### Common issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Try-It shows YAML examples instead of live data | `?body=` not in iframe URL | Check that `LiveRpcDoc` has `rpcMethod` + `rpcParams` props |
| Try-It shows empty body | Live data field resolved to `null` | Tx fields may be null if no recent tx found; this is by design -- auto-fill is skipped |
| Body appears but with wrong values | `rpcParams` template has wrong field names | Check mapping table above; field names are case-sensitive |
| `configure.ts` doesn't fire | File not in `@theme/ext/` | Verify path matches Redocly Realm conventions |
| CORS/CSP errors in console | Production deployment needs headers | Configure CORS on the Redocly deployment |

## Configuration Checklist

### For Headless Mode (Embedding)

- [x] Created `reference.page.yaml` with `pagination: item`
- [x] Created `configure.ts` for auth injection + body passthrough
- [x] `RequestValues` type includes `body?: any`
- [ ] Set `sidebar.hide: true` in redocly.yaml
- [ ] Set `navbar.hide: true` in redocly.yaml
- [ ] Deploy to production
- [ ] Test CORS/CSP headers
- [ ] End-to-end test: builder-docs live data -> iframe -> Try-It pre-fill -> successful RPC call
