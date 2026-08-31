import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  clearPortalApiKey,
  setPortalApiKey,
  usePortalAuth,
} from "./portalAuth";
import {
  getPortalApiKeyStatus,
  getPortalAuthSummary,
} from "./portalAuthUi";
import { FINALITY_OPTIONS, type FinalityKey } from "./finalityOptions";
import { FastnearOperationReference } from "./FastnearOperationReference";
import type {
  FastnearInteractionField,
  FastnearInteractionNetwork,
  FastnearPageModel,
} from "./fastnearPageModel";
type RunResult =
  | {
      kind: "json";
      ok: boolean;
      status: number;
      url: string;
      value: any;
    }
  | {
      kind: "text";
      ok: boolean;
      status: number;
      url: string;
      value: string;
    };

function copyText(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value);
  }

  if (typeof document === "undefined") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = value;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      try {
        document.execCommand("copy");
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        document.body.removeChild(textArea);
      }
    } catch (error) {
      reject(error);
    }
  });
}

function CopyGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2m-6 12h8a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2z"
      />
    </svg>
  );
}

function CheckGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

function ExternalLinkGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M14 5h5m0 0v5m0-5L10 14"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 7H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2"
      />
    </svg>
  );
}

function escapeShellSingleQuotes(value: string) {
  return value.replace(/'/g, `'\"'\"'`);
}

function stringifyCurlHeader(name: string, value: string) {
  return `-H '${escapeShellSingleQuotes(`${name}: ${value}`)}'`;
}

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

type FieldAdapterMode = {
  label: string;
  value: string;
};

type FieldAdapter = {
  defaultMode: string;
  displayLabel?: string;
  helperText?: string | ((mode: string) => string);
  inferModeFromWireValue?: (value: unknown) => string;
  multiline?: boolean;
  modes?: FieldAdapterMode[];
  serializeWireValue?: (value: unknown, mode: string) => string;
  toWireValue?: (draft: string, mode: string) => unknown;
};

function normalizeBase64Value(value: string) {
  return value.replace(/\s+/g, "").trim();
}

function encodeUtf8ToBase64(value: string) {
  if (!value) {
    return "";
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64");
  }

  if (typeof TextEncoder !== "undefined" && typeof btoa !== "undefined") {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  throw new Error("Base64 encoding is not supported in this environment.");
}

function decodeBase64ToUtf8(value: string) {
  const normalized = normalizeBase64Value(value);
  if (!normalized) {
    return "";
  }

  if (!BASE64_PATTERN.test(normalized)) {
    throw new Error("Invalid base64 value.");
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(normalized, "base64").toString("utf8");
  }

  if (typeof TextDecoder !== "undefined" && typeof atob !== "undefined") {
    const binary = atob(normalized);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  throw new Error("Base64 decoding is not supported in this environment.");
}

function tryDecodeBase64ToUtf8(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    return decodeBase64ToUtf8(value);
  } catch {
    return null;
  }
}

function isMostlyPrintableText(value: string) {
  return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}

const FIELD_ADAPTERS: Record<string, FieldAdapter> = {
  "rpc-call-function:args_base64": {
    defaultMode: "json",
    displayLabel: "Args",
    helperText: (mode) => {
      if (mode === "raw-base64") {
        return "Advanced: provide pre-encoded base64 exactly as it should be sent.";
      }

      if (mode === "text") {
        return "Paste plain text and we'll UTF-8/base64 encode it for the RPC request.";
      }

      return "Paste JSON and we'll UTF-8/base64 encode it for the RPC request.";
    },
    inferModeFromWireValue: (value) => {
      const decoded = tryDecodeBase64ToUtf8(value);
      if (decoded === null) {
        return "raw-base64";
      }

      if (decoded.trim()) {
        try {
          JSON.parse(decoded);
          return "json";
        } catch {}
      }

      return "text";
    },
    multiline: true,
    modes: [
      { label: "JSON", value: "json" },
      { label: "Text", value: "text" },
      { label: "Raw base64", value: "raw-base64" },
    ],
    serializeWireValue: (value, mode) => {
      const rawValue =
        value === undefined || value === null
          ? ""
          : typeof value === "string"
            ? value
            : String(value);

      if (!rawValue || mode === "raw-base64") {
        return rawValue;
      }

      const decoded = tryDecodeBase64ToUtf8(rawValue);
      if (decoded === null) {
        return rawValue;
      }

      if (mode === "json") {
        try {
          return JSON.stringify(JSON.parse(decoded), null, 2);
        } catch {
          return decoded;
        }
      }

      return decoded;
    },
    toWireValue: (draft, mode) => {
      if (mode === "raw-base64") {
        return normalizeBase64Value(draft);
      }

      if (mode === "json") {
        if (!draft.trim()) {
          return "";
        }

        try {
          return encodeUtf8ToBase64(JSON.stringify(JSON.parse(draft)));
        } catch {
          throw new Error("Args must be valid JSON when JSON mode is selected.");
        }
      }

      return encodeUtf8ToBase64(draft);
    },
  },
  "rpc-view-state:prefix_base64": {
    defaultMode: "text",
    displayLabel: "Prefix",
    helperText: (mode) =>
      mode === "raw-base64"
        ? "Advanced: provide a pre-encoded base64 prefix exactly as it should be sent."
        : "Paste a plain-text storage prefix and we'll UTF-8/base64 encode it for the RPC request.",
    inferModeFromWireValue: (value) => {
      if (!value) {
        return "text";
      }

      const decoded = tryDecodeBase64ToUtf8(value);
      if (decoded === null || !isMostlyPrintableText(decoded)) {
        return "raw-base64";
      }

      return "text";
    },
    modes: [
      { label: "Text", value: "text" },
      { label: "Raw base64", value: "raw-base64" },
    ],
    serializeWireValue: (value, mode) => {
      const rawValue =
        value === undefined || value === null
          ? ""
          : typeof value === "string"
            ? value
            : String(value);

      if (!rawValue || mode === "raw-base64") {
        return rawValue;
      }

      const decoded = tryDecodeBase64ToUtf8(rawValue);
      if (decoded === null || !isMostlyPrintableText(decoded)) {
        return rawValue;
      }

      return decoded;
    },
    toWireValue: (draft, mode) => {
      if (mode === "raw-base64") {
        return normalizeBase64Value(draft);
      }

      return encodeUtf8ToBase64(draft);
    },
  },
};

function getFieldAdapter(pageModelId: string, fieldName: string) {
  return FIELD_ADAPTERS[`${pageModelId}:${fieldName}`];
}

function getDisplayFieldLabel(pageModel: FastnearPageModel, field: FastnearInteractionField) {
  return getFieldAdapter(pageModel.pageModelId, field.name)?.displayLabel || field.label;
}

function getFieldAdapterHelperText(
  pageModel: FastnearPageModel,
  field: FastnearInteractionField,
  fieldMode: string
) {
  const helperText = getFieldAdapter(pageModel.pageModelId, field.name)?.helperText;
  if (!helperText) {
    return undefined;
  }

  return typeof helperText === "function" ? helperText(fieldMode) : helperText;
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function cloneJsonValue<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function getInitialNetwork(pageModel: FastnearPageModel) {
  if (typeof window === "undefined") {
    return pageModel.interaction.networks[0]?.key || "mainnet";
  }

  const search = new URLSearchParams(window.location.search);
  const requestedNetwork = search.get("network");
  const matched = pageModel.interaction.networks.find((network) => network.key === requestedNetwork);
  return matched?.key || pageModel.interaction.networks[0]?.key || "mainnet";
}

function getDefaultFieldValue(
  pageModel: FastnearPageModel,
  field: FastnearInteractionField,
  networkKey: string
) {
  const selectedNetwork = pageModel.interaction.networks.find((network) => network.key === networkKey);
  const fieldAdapter = getFieldAdapter(pageModel.pageModelId, field.name);
  const fieldMode =
    fieldAdapter?.inferModeFromWireValue?.(selectedNetwork?.defaultFields?.[field.name]) ||
    fieldAdapter?.defaultMode;
  return serializeFieldDraftValue(pageModel, field, selectedNetwork?.defaultFields?.[field.name], fieldMode);
}

function getDefaultFieldValues(pageModel: FastnearPageModel, networkKey: string) {
  return Object.fromEntries(
    pageModel.interaction.fields.map((field) => [
      field.name,
      getDefaultFieldValue(pageModel, field, networkKey),
    ])
  );
}

function getDefaultFieldModes(pageModel: FastnearPageModel, networkKey: string) {
  const selectedNetwork = pageModel.interaction.networks.find((network) => network.key === networkKey);

  return Object.fromEntries(
    pageModel.interaction.fields.map((field) => {
      const fieldAdapter = getFieldAdapter(pageModel.pageModelId, field.name);
      return [
        field.name,
        fieldAdapter?.inferModeFromWireValue?.(selectedNetwork?.defaultFields?.[field.name]) ||
          fieldAdapter?.defaultMode ||
          "",
      ];
    })
  );
}

function getFieldModesFromWireValues(
  pageModel: FastnearPageModel,
  values: Record<string, unknown>
) {
  return Object.fromEntries(
    pageModel.interaction.fields.map((field) => {
      const fieldAdapter = getFieldAdapter(pageModel.pageModelId, field.name);
      return [
        field.name,
        fieldAdapter?.inferModeFromWireValue?.(values[field.name]) || fieldAdapter?.defaultMode || "",
      ];
    })
  );
}

function getRunResultText(runResult: RunResult | null): string {
  if (!runResult) {
    return "";
  }

  return runResult.kind === "json" ? formatJson(runResult.value) : runResult.value;
}

type RuntimeFieldDefaults = Record<string, unknown>;

type RuntimeFieldDefaultConfig = {
  targetFieldNames: string[];
  fetchDefaults: (
    baseUrl: string,
    networkKey: string,
    signal?: AbortSignal
  ) => Promise<RuntimeFieldDefaults | null>;
};

const RUNTIME_FIELD_DEFAULTS: Record<string, RuntimeFieldDefaultConfig> = {
  "rpc-block-by-height": {
    targetFieldNames: ["block_id"],
    fetchDefaults: async (baseUrl, _networkKey, signal) => {
      const latestBlockHeight = await fetchLatestRpcBlockHeight(baseUrl, signal);
      if (!Number.isFinite(latestBlockHeight)) {
        return null;
      }

      return { block_id: String(latestBlockHeight) };
    },
  },
  "neardata-v0-block": {
    targetFieldNames: ["block_height"],
    fetchDefaults: async (baseUrl, _networkKey, signal) =>
      fetchLatestNeardataFieldDefaults(baseUrl, "final", false, signal),
  },
  "neardata-v0-block-headers": {
    targetFieldNames: ["block_height"],
    fetchDefaults: async (baseUrl, _networkKey, signal) =>
      fetchLatestNeardataFieldDefaults(baseUrl, "final", false, signal),
  },
  "neardata-v0-block-chunk": {
    targetFieldNames: ["block_height", "shard_id"],
    fetchDefaults: async (baseUrl, _networkKey, signal) =>
      fetchLatestNeardataFieldDefaults(baseUrl, "final", true, signal),
  },
  "neardata-v0-block-shard": {
    targetFieldNames: ["block_height", "shard_id"],
    fetchDefaults: async (baseUrl, _networkKey, signal) =>
      fetchLatestNeardataFieldDefaults(baseUrl, "final", true, signal),
  },
  "neardata-v0-block-optimistic": {
    targetFieldNames: ["block_height"],
    fetchDefaults: async (baseUrl, _networkKey, signal) =>
      fetchLatestNeardataFieldDefaults(baseUrl, "optimistic", false, signal),
  },
  "transactions-v0-account": {
    targetFieldNames: ["account_id"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestTransactionsFieldDefaults(baseUrl, networkKey, "transactions-v0-account", signal),
  },
  "transactions-v0-block": {
    targetFieldNames: ["block_id"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestTransactionsFieldDefaults(baseUrl, networkKey, "transactions-v0-block", signal),
  },
  "transactions-v0-blocks": {
    targetFieldNames: ["from_block_height", "to_block_height"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestTransactionsFieldDefaults(baseUrl, networkKey, "transactions-v0-blocks", signal),
  },
  "transactions-v0-receipt": {
    targetFieldNames: ["receipt_id"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestTransactionsFieldDefaults(baseUrl, networkKey, "transactions-v0-receipt", signal),
  },
  "transactions-v0-transactions": {
    targetFieldNames: ["tx_hashes"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestTransactionsFieldDefaults(baseUrl, networkKey, "transactions-v0-transactions", signal),
  },
  "fastnear-v0-account-staking": {
    targetFieldNames: ["account_id"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestFastnearFieldDefaults(baseUrl, networkKey, "fastnear-v0-account-staking", signal),
  },
  "fastnear-v0-account-ft": {
    targetFieldNames: ["account_id"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestFastnearFieldDefaults(baseUrl, networkKey, "fastnear-v0-account-ft", signal),
  },
  "fastnear-v0-account-nft": {
    targetFieldNames: ["account_id"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestFastnearFieldDefaults(baseUrl, networkKey, "fastnear-v0-account-nft", signal),
  },
  "fastnear-v0-public-key-lookup": {
    targetFieldNames: ["public_key"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestFastnearFieldDefaults(baseUrl, networkKey, "fastnear-v0-public-key-lookup", signal),
  },
  "fastnear-v0-public-key-lookup-all": {
    targetFieldNames: ["public_key"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestFastnearFieldDefaults(baseUrl, networkKey, "fastnear-v0-public-key-lookup-all", signal),
  },
  "fastnear-v1-account-staking": {
    targetFieldNames: ["account_id"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestFastnearFieldDefaults(baseUrl, networkKey, "fastnear-v1-account-staking", signal),
  },
  "fastnear-v1-account-ft": {
    targetFieldNames: ["account_id"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestFastnearFieldDefaults(baseUrl, networkKey, "fastnear-v1-account-ft", signal),
  },
  "fastnear-v1-account-nft": {
    targetFieldNames: ["account_id"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestFastnearFieldDefaults(baseUrl, networkKey, "fastnear-v1-account-nft", signal),
  },
  "fastnear-v1-account-full": {
    targetFieldNames: ["account_id"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestFastnearFieldDefaults(baseUrl, networkKey, "fastnear-v1-account-full", signal),
  },
  "fastnear-v1-public-key-lookup": {
    targetFieldNames: ["public_key"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestFastnearFieldDefaults(baseUrl, networkKey, "fastnear-v1-public-key-lookup", signal),
  },
  "fastnear-v1-public-key-lookup-all": {
    targetFieldNames: ["public_key"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestFastnearFieldDefaults(baseUrl, networkKey, "fastnear-v1-public-key-lookup-all", signal),
  },
  "fastnear-v1-ft-top": {
    targetFieldNames: ["token_id"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestFastnearFieldDefaults(baseUrl, networkKey, "fastnear-v1-ft-top", signal),
  },
  "kv-fastdata-v0-all-by-predecessor": {
    targetFieldNames: ["predecessor_id"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestKvFastdataFieldDefaults(baseUrl, networkKey, "kv-fastdata-v0-all-by-predecessor", signal),
  },
  "kv-fastdata-v0-history-by-key": {
    targetFieldNames: ["include_metadata", "key"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestKvFastdataFieldDefaults(baseUrl, networkKey, "kv-fastdata-v0-history-by-key", signal),
  },
  "kv-fastdata-v0-history-by-account": {
    targetFieldNames: ["current_account_id", "key_prefix"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestKvFastdataFieldDefaults(baseUrl, networkKey, "kv-fastdata-v0-history-by-account", signal),
  },
  "kv-fastdata-v0-history-by-predecessor": {
    targetFieldNames: ["current_account_id", "predecessor_id", "key_prefix"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestKvFastdataFieldDefaults(baseUrl, networkKey, "kv-fastdata-v0-history-by-predecessor", signal),
  },
  "kv-fastdata-v0-get-history-key": {
    targetFieldNames: ["current_account_id", "predecessor_id", "key"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestKvFastdataFieldDefaults(baseUrl, networkKey, "kv-fastdata-v0-get-history-key", signal),
  },
  "kv-fastdata-v0-latest-by-account": {
    targetFieldNames: ["current_account_id", "key_prefix"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestKvFastdataFieldDefaults(baseUrl, networkKey, "kv-fastdata-v0-latest-by-account", signal),
  },
  "kv-fastdata-v0-latest-by-predecessor": {
    targetFieldNames: ["current_account_id", "predecessor_id", "key_prefix"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestKvFastdataFieldDefaults(baseUrl, networkKey, "kv-fastdata-v0-latest-by-predecessor", signal),
  },
  "kv-fastdata-v0-get-latest-key": {
    targetFieldNames: ["current_account_id", "predecessor_id", "key"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestKvFastdataFieldDefaults(baseUrl, networkKey, "kv-fastdata-v0-get-latest-key", signal),
  },
  "kv-fastdata-v0-multi": {
    targetFieldNames: ["keys"],
    fetchDefaults: async (baseUrl, networkKey, signal) =>
      fetchLatestKvFastdataFieldDefaults(baseUrl, networkKey, "kv-fastdata-v0-multi", signal),
  },
};

async function fetchLatestRpcBlockHeight(baseUrl: string, signal?: AbortSignal): Promise<number | null> {
  const normalizedUrl = baseUrl.replace(/\/+$/, "");

  try {
    const response = await fetch(`${normalizedUrl}/status`, {
      headers: { Accept: "application/json" },
      signal,
    });

    if (response.ok) {
      const payload = await response.json();
      const latestBlockHeight = Number(payload?.latest_block_height);
      if (Number.isFinite(latestBlockHeight)) {
        return latestBlockHeight;
      }
    }
  } catch {}

  try {
    const response = await fetch(normalizedUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "fastnear-docs",
        method: "status",
        params: [],
      }),
      signal,
    });

    if (response.ok) {
      const payload = await response.json();
      const latestBlockHeight = Number(payload?.result?.sync_info?.latest_block_height);
      if (Number.isFinite(latestBlockHeight)) {
        return latestBlockHeight;
      }
    }
  } catch {}

  return null;
}

async function fetchLatestNeardataFieldDefaults(
  baseUrl: string,
  mode: "final" | "optimistic",
  includeShardId: boolean,
  signal?: AbortSignal
): Promise<RuntimeFieldDefaults | null> {
  const normalizedUrl = baseUrl.replace(/\/+$/, "");
  const requestPath =
    mode === "optimistic" ? "/v0/last_block/optimistic" : "/v0/last_block/final";

  try {
    const response = await fetch(`${normalizedUrl}${requestPath}`, {
      headers: { Accept: "application/json" },
      signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const blockHeight = Number(payload?.block?.header?.height);
    if (!Number.isFinite(blockHeight)) {
      return null;
    }

    const nextDefaults: RuntimeFieldDefaults = {
      block_height: String(blockHeight),
    };

    if (includeShardId) {
      const shardEntry = Array.isArray(payload?.shards)
        ? payload.shards.find((shard: any) => Number.isFinite(Number(shard?.shard_id)))
        : null;
      const shardId = Number.isFinite(Number(shardEntry?.shard_id))
        ? Number(shardEntry.shard_id)
        : 0;
      nextDefaults.shard_id = String(shardId);
    }

    return nextDefaults;
  } catch {}

  return null;
}

function getTransactionsDiscoveryAccount(baseUrl: string, networkKey: string) {
  const normalizedUrl = baseUrl.toLowerCase();
  if (networkKey === "testnet" || normalizedUrl.includes("tx.test.")) {
    return "root.testnet";
  }

  return "intents.near";
}

async function postTransactionsJson(
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
) {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
    body: JSON.stringify(body),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  if (!response.ok) {
    return null;
  }

  return await response.json();
}

function getTransactionsReceiptId(transaction: any) {
  if (typeof transaction?.execution_outcome?.outcome?.status?.SuccessReceiptId === "string") {
    return transaction.execution_outcome.outcome.status.SuccessReceiptId;
  }

  const outcomeReceiptId = transaction?.execution_outcome?.outcome?.receipt_ids?.find(
    (receiptId: unknown) => typeof receiptId === "string"
  );
  if (outcomeReceiptId) {
    return outcomeReceiptId;
  }

  const nestedReceiptId = transaction?.receipts?.find(
    (receiptEntry: any) => typeof receiptEntry?.receipt?.receipt_id === "string"
  )?.receipt?.receipt_id;
  if (nestedReceiptId) {
    return nestedReceiptId;
  }

  return null;
}

async function fetchLatestTransactionsContext(
  baseUrl: string,
  networkKey: string,
  signal?: AbortSignal
) {
  const sourceAccount = getTransactionsDiscoveryAccount(baseUrl, networkKey);
  const accountPayload = await postTransactionsJson(
    baseUrl,
    "/v0/account",
    {
      account_id: sourceAccount,
      desc: true,
      is_real_signer: true,
      is_success: true,
      limit: 5,
    },
    signal
  );

  const recentRows = Array.isArray(accountPayload?.account_txs)
    ? accountPayload.account_txs.filter(
        (row: any) =>
          typeof row?.transaction_hash === "string" &&
          Number.isFinite(Number(row?.tx_block_height))
      )
    : [];

  if (recentRows.length === 0) {
    return null;
  }

  const latestBlockHeight = Math.max(
    ...recentRows.map((row: any) => Number(row.tx_block_height))
  );
  const recentTxHashes = [...new Set(recentRows.map((row: any) => row.transaction_hash))].slice(0, 2);
  const rangeStart = Math.max(0, latestBlockHeight - 9);
  let recentReceiptId = null;

  if (recentTxHashes.length > 0) {
    const transactionPayload = await postTransactionsJson(
      baseUrl,
      "/v0/transactions",
      { tx_hashes: recentTxHashes },
      signal
    );
    const transactions = Array.isArray(transactionPayload?.transactions)
      ? transactionPayload.transactions
      : [];
    recentReceiptId =
      transactions.map((transaction: any) => getTransactionsReceiptId(transaction)).find(Boolean) || null;
  }

  return {
    latestBlockHeight,
    rangeStart,
    recentReceiptId,
    recentTxHashes,
    sourceAccount,
  };
}

async function fetchLatestTransactionsFieldDefaults(
  baseUrl: string,
  networkKey: string,
  pageModelId: string,
  signal?: AbortSignal
): Promise<RuntimeFieldDefaults | null> {
  const context = await fetchLatestTransactionsContext(baseUrl, networkKey, signal);
  if (!context) {
    return null;
  }

  switch (pageModelId) {
    case "transactions-v0-account":
      return {
        account_id: context.sourceAccount,
      };
    case "transactions-v0-block":
      return {
        block_id: context.latestBlockHeight,
      };
    case "transactions-v0-blocks":
      return {
        from_block_height: context.rangeStart,
        to_block_height: context.latestBlockHeight,
      };
    case "transactions-v0-receipt":
      return context.recentReceiptId
        ? {
            receipt_id: context.recentReceiptId,
          }
        : null;
    case "transactions-v0-transactions":
      return context.recentTxHashes.length > 0
        ? {
            tx_hashes: context.recentTxHashes,
          }
        : null;
    default:
      return null;
  }
}

function getFastnearDiscoveryAccount(baseUrl: string, networkKey: string) {
  const normalizedUrl = baseUrl.toLowerCase();
  if (networkKey === "testnet" || normalizedUrl.includes("test.api.")) {
    return "root.testnet";
  }

  return "root.near";
}

function getFastnearDiscoveryTokenId(baseUrl: string, networkKey: string) {
  const normalizedUrl = baseUrl.toLowerCase();
  if (networkKey === "testnet" || normalizedUrl.includes("test.api.")) {
    return "wrap.testnet";
  }

  return "wrap.near";
}

function getFastnearRpcUrl(baseUrl: string, networkKey: string) {
  const normalizedUrl = baseUrl.toLowerCase();
  if (networkKey === "testnet" || normalizedUrl.includes("test.api.")) {
    return "https://rpc.testnet.fastnear.com";
  }

  return "https://rpc.mainnet.fastnear.com";
}

async function fetchFastnearJson(url: string, signal?: AbortSignal) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    return null;
  }

  return await response.json();
}

async function postFastnearRpc(
  baseUrl: string,
  networkKey: string,
  method: string,
  params: Record<string, unknown>,
  signal?: AbortSignal
) {
  const response = await fetch(getFastnearRpcUrl(baseUrl, networkKey), {
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "fastnear-docs",
      method,
      params,
    }),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  if (payload?.error) {
    return null;
  }

  return payload?.result || null;
}

async function fetchFastnearPublicKey(
  baseUrl: string,
  networkKey: string,
  signal?: AbortSignal
) {
  const sourceAccount = getFastnearDiscoveryAccount(baseUrl, networkKey);
  const accessKeyList = await postFastnearRpc(
    baseUrl,
    networkKey,
    "query",
    {
      request_type: "view_access_key_list",
      finality: "final",
      account_id: sourceAccount,
    },
    signal
  );

  const publicKeys = Array.isArray(accessKeyList?.keys)
    ? accessKeyList.keys
        .map((row: any) => row?.public_key)
        .filter((publicKey: unknown) => typeof publicKey === "string")
    : [];

  for (const publicKey of publicKeys.slice(0, 12)) {
    const lookupPayload = await fetchFastnearJson(
      `${baseUrl.replace(/\/+$/, "")}/v1/public_key/${encodeURIComponent(publicKey)}/all`,
      signal
    );
    const accountIds = Array.isArray(lookupPayload?.account_ids)
      ? lookupPayload.account_ids
      : [];

    if (accountIds.includes(sourceAccount)) {
      return publicKey;
    }
  }

  return publicKeys[0] || null;
}

async function fetchLatestFastnearFieldDefaults(
  baseUrl: string,
  networkKey: string,
  pageModelId: string,
  signal?: AbortSignal
): Promise<RuntimeFieldDefaults | null> {
  const sourceAccount = getFastnearDiscoveryAccount(baseUrl, networkKey);
  const tokenId = getFastnearDiscoveryTokenId(baseUrl, networkKey);

  switch (pageModelId) {
    case "fastnear-v0-account-staking":
    case "fastnear-v0-account-ft":
    case "fastnear-v0-account-nft":
    case "fastnear-v1-account-staking":
    case "fastnear-v1-account-ft":
    case "fastnear-v1-account-nft":
    case "fastnear-v1-account-full":
      return {
        account_id: sourceAccount,
      };
    case "fastnear-v0-public-key-lookup":
    case "fastnear-v0-public-key-lookup-all":
    case "fastnear-v1-public-key-lookup":
    case "fastnear-v1-public-key-lookup-all": {
      const publicKey = await fetchFastnearPublicKey(baseUrl, networkKey, signal);
      return publicKey
        ? {
            public_key: publicKey,
          }
        : null;
    }
    case "fastnear-v1-ft-top":
      return {
        token_id: tokenId,
      };
    default:
      return null;
  }
}

function getKvFastdataFallbackContext(baseUrl: string, networkKey: string) {
  const normalizedUrl = baseUrl.toLowerCase();
  if (networkKey === "testnet" || normalizedUrl.includes("kv.test.")) {
    return {
      currentAccountId: "kv.gork-agent.testnet",
      historyByKeyIncludeMetadata: false,
      key: "value",
      keyPrefix: "value",
      predecessorId: "kv.gork-agent.testnet",
    };
  }

  return {
    currentAccountId: "social.near",
    historyByKeyIncludeMetadata: false,
    key: "graph/follow/sleet.near",
    keyPrefix: "graph/follow/",
    predecessorId: "james.near",
  };
}

function getKvFastdataCandidateAccounts(baseUrl: string, networkKey: string) {
  const normalizedUrl = baseUrl.toLowerCase();
  if (networkKey === "testnet" || normalizedUrl.includes("kv.test.")) {
    return [
      "kv.gork-agent.testnet",
      "guest-book.testnet",
      "root.testnet",
      "social.testnet",
      "jsvm.testnet",
      "v1.signer-prod.testnet",
    ];
  }

  return ["social.near", "contextual.near", "app.near"];
}

function getKvFastdataKeyPrefix(key: string) {
  const trimmedKey = String(key || "").trim();
  if (!trimmedKey) {
    return "";
  }

  const lastSlashIndex = trimmedKey.lastIndexOf("/");
  if (lastSlashIndex === -1) {
    return trimmedKey;
  }

  return trimmedKey.slice(0, lastSlashIndex + 1);
}

function buildKvFastdataMissingKey(keyPrefix: string) {
  const normalizedPrefix = String(keyPrefix || "").trim();
  if (!normalizedPrefix) {
    return "missing";
  }

  return `${normalizedPrefix}missing`;
}

async function postKvFastdataJson(
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
) {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
    body: JSON.stringify(body),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  if (!response.ok) {
    return null;
  }

  return await response.json();
}

async function getKvFastdataJson(
  baseUrl: string,
  path: string,
  signal?: AbortSignal
) {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    return null;
  }

  return await response.json();
}

async function fetchKvFastdataContext(
  baseUrl: string,
  networkKey: string,
  signal?: AbortSignal
) {
  const fallbackContext = getKvFastdataFallbackContext(baseUrl, networkKey);

  for (const accountId of getKvFastdataCandidateAccounts(baseUrl, networkKey)) {
    const latestPayload = await postKvFastdataJson(
      baseUrl,
      `/v0/latest/${encodeURIComponent(accountId)}`,
      { include_metadata: true, limit: 5 },
      signal
    );
    const entries = Array.isArray(latestPayload?.entries)
      ? latestPayload.entries.filter(
          (entry: any) =>
            entry &&
            typeof entry.current_account_id === "string" &&
            typeof entry.predecessor_id === "string" &&
            typeof entry.key === "string"
        )
      : [];

    for (const entry of entries) {
      const currentAccountId = entry.current_account_id;
      const predecessorId = entry.predecessor_id;
      const key = entry.key;
      const keyPrefix = getKvFastdataKeyPrefix(key);

      const historyByAccount = await postKvFastdataJson(
        baseUrl,
        `/v0/history/${encodeURIComponent(currentAccountId)}`,
        {
          asc: false,
          include_metadata: true,
          key_prefix: keyPrefix,
          limit: 1,
        },
        signal
      );
      const historyByKey = await postKvFastdataJson(
        baseUrl,
        "/v0/history",
        {
          asc: false,
          key,
          limit: 1,
        },
        signal
      );
      const latestExactKey = await getKvFastdataJson(
        baseUrl,
        `/v0/latest/${encodeURIComponent(currentAccountId)}/${encodeURIComponent(predecessorId)}/${encodeURIComponent(key)}`,
        signal
      );

      if (historyByAccount && historyByKey && latestExactKey) {
        return {
          currentAccountId,
          historyByKeyIncludeMetadata: false,
          key,
          keyPrefix,
          predecessorId,
        };
      }
    }
  }

  return fallbackContext;
}

async function fetchLatestKvFastdataFieldDefaults(
  baseUrl: string,
  networkKey: string,
  pageModelId: string,
  signal?: AbortSignal
): Promise<RuntimeFieldDefaults | null> {
  const context = await fetchKvFastdataContext(baseUrl, networkKey, signal);

  switch (pageModelId) {
    case "kv-fastdata-v0-all-by-predecessor":
      return {
        predecessor_id: context.predecessorId,
      };
    case "kv-fastdata-v0-history-by-key":
      return {
        include_metadata: context.historyByKeyIncludeMetadata,
        key: context.key,
      };
    case "kv-fastdata-v0-history-by-account":
      return {
        current_account_id: context.currentAccountId,
        key_prefix: context.keyPrefix,
      };
    case "kv-fastdata-v0-history-by-predecessor":
      return {
        current_account_id: context.currentAccountId,
        predecessor_id: context.predecessorId,
        key_prefix: context.keyPrefix,
      };
    case "kv-fastdata-v0-get-history-key":
    case "kv-fastdata-v0-get-latest-key":
      return {
        current_account_id: context.currentAccountId,
        predecessor_id: context.predecessorId,
        key: context.key,
      };
    case "kv-fastdata-v0-latest-by-account":
      return {
        current_account_id: context.currentAccountId,
        key_prefix: context.keyPrefix,
      };
    case "kv-fastdata-v0-latest-by-predecessor":
      return {
        current_account_id: context.currentAccountId,
        predecessor_id: context.predecessorId,
        key_prefix: context.keyPrefix,
      };
    case "kv-fastdata-v0-multi":
      return {
        keys: [
          `${context.currentAccountId}/${context.predecessorId}/${context.key}`,
          `${context.currentAccountId}/${context.predecessorId}/${buildKvFastdataMissingKey(context.keyPrefix)}`,
        ],
      };
    default:
      return null;
  }
}

function getFieldLocationLabel(field: FastnearInteractionField) {
  if (field.location === "path") {
    return "Path parameter";
  }

  if (field.location === "query") {
    return "Query parameter";
  }

  if (field.location === "body") {
    return "Request body field";
  }

  return undefined;
}

function getFieldTypeValues(field: FastnearInteractionField) {
  return Array.isArray(field.schema?.type)
    ? field.schema.type
    : field.schema?.type
      ? [field.schema.type]
      : [];
}

function fieldSupportsType(field: FastnearInteractionField, type: string) {
  const fieldTypes = getFieldTypeValues(field);
  const fieldOneOf = field.schema?.oneOf;

  return (
    fieldTypes.includes(type) ||
    (fieldOneOf || []).some((variant: any) => variant?.type === type)
  );
}

function isBooleanField(field: FastnearInteractionField) {
  return fieldSupportsType(field, "boolean");
}

function isArrayField(field: FastnearInteractionField) {
  return fieldSupportsType(field, "array") || Boolean(field.schema?.items);
}

function isObjectField(field: FastnearInteractionField) {
  return fieldSupportsType(field, "object") || Boolean(field.schema?.properties?.length);
}

function isMultilineField(pageModel: FastnearPageModel, field: FastnearInteractionField) {
  return isArrayField(field) || isObjectField(field) || Boolean(getFieldAdapter(pageModel.pageModelId, field.name)?.multiline);
}

function getEnumOptions(field: FastnearInteractionField) {
  const enumValues = Array.isArray(field.schema?.enum) ? field.schema.enum : [];
  return enumValues.map((value: unknown) => String(value));
}

function formatChoiceLabel(value: string) {
  return value
    .split(/[_-]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function serializeFieldDraftValue(
  pageModel: FastnearPageModel,
  field: FastnearInteractionField,
  value: unknown,
  modeOverride?: string
): string {
  const fieldAdapter = getFieldAdapter(pageModel.pageModelId, field.name);
  if (fieldAdapter?.serializeWireValue) {
    return fieldAdapter.serializeWireValue(
      value,
      modeOverride || fieldAdapter.inferModeFromWireValue?.(value) || fieldAdapter.defaultMode
    );
  }

  if (value === undefined || value === null) {
    return "";
  }

  if (Array.isArray(value)) {
    if (field.schema?.items?.type === "string" || value.every((entry) => typeof entry === "string")) {
      return value.map((entry) => String(entry)).join("\n");
    }

    return JSON.stringify(value, null, 2);
  }

  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value);
}

function parseFieldValue(
  pageModel: FastnearPageModel,
  field: FastnearInteractionField,
  rawValue: string,
  modeOverride?: string
) {
  const fieldAdapter = getFieldAdapter(pageModel.pageModelId, field.name);
  if (fieldAdapter?.toWireValue) {
    return fieldAdapter.toWireValue(rawValue, modeOverride || fieldAdapter.defaultMode);
  }

  const trimmedValue = rawValue.trim();
  const canBeArray = isArrayField(field);
  const canBeObject = isObjectField(field);
  const canBeBoolean = isBooleanField(field);
  const canBeInteger = fieldSupportsType(field, "integer");
  const canBeNumber = fieldSupportsType(field, "number");
  const fieldTypes = getFieldTypeValues(field);
  const canBeString = fieldSupportsType(field, "string") || fieldTypes.length === 0;

  if (canBeArray) {
    if (!trimmedValue) {
      return [];
    }

    if (trimmedValue.startsWith("[")) {
      try {
        return JSON.parse(trimmedValue);
      } catch (_error) {
        return trimmedValue
          .split(/\r?\n|,/)
          .map((entry) => entry.trim())
          .filter(Boolean);
      }
    }

    return trimmedValue
      .split(/\r?\n|,/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (canBeObject) {
    if (!trimmedValue) {
      return {};
    }

    if (trimmedValue.startsWith("{")) {
      try {
        return JSON.parse(trimmedValue);
      } catch (_error) {
        return trimmedValue;
      }
    }
  }

  if (canBeBoolean && (trimmedValue === "true" || trimmedValue === "false")) {
    return trimmedValue === "true";
  }

  if (canBeInteger && /^-?\d+$/.test(trimmedValue)) {
    return Number(trimmedValue);
  }

  if (canBeNumber && /^-?\d+(\.\d+)?$/.test(trimmedValue)) {
    return Number(trimmedValue);
  }

  if (canBeString || canBeInteger || canBeNumber || canBeBoolean) {
    return trimmedValue;
  }

  return trimmedValue;
}

function buildRpcPayload(
  pageModel: FastnearPageModel,
  fieldValues: Record<string, string>,
  fieldModes: Record<string, string>,
  finality: FinalityKey,
  requestTemplate?: unknown
) {
  try {
    const parsedFieldValues = Object.fromEntries(
      pageModel.interaction.fields
        .map((field) => {
          const rawValue = fieldValues[field.name] || "";
          if (!rawValue.trim()) {
            return undefined;
          }

          return [field.name, parseFieldValue(pageModel, field, rawValue, fieldModes[field.name])];
        })
        .filter(Boolean) as Array<[string, unknown]>
    );

    const template =
      requestTemplate && typeof requestTemplate === "object" && !Array.isArray(requestTemplate)
        ? cloneJsonValue(requestTemplate as Record<string, unknown>)
        : {};
    const templateParams = (template as Record<string, unknown>).params;

    if (Array.isArray(templateParams)) {
      return {
        error: null,
        payload: {
          ...(template as Record<string, unknown>),
          jsonrpc:
            typeof (template as Record<string, unknown>).jsonrpc === "string"
              ? (template as Record<string, unknown>).jsonrpc
              : "2.0",
          id:
            (template as Record<string, unknown>).id !== undefined
              ? (template as Record<string, unknown>).id
              : pageModel.interaction.defaultId || "fastnear",
          method:
            typeof (template as Record<string, unknown>).method === "string"
              ? (template as Record<string, unknown>).method
              : pageModel.interaction.requestMethod || pageModel.info.operationId,
          params: cloneJsonValue(templateParams),
        },
      };
    }

    const baseParams =
      templateParams && typeof templateParams === "object"
        ? cloneJsonValue(templateParams as Record<string, unknown>)
        : {};

    return {
      error: null,
      payload: {
        ...(template as Record<string, unknown>),
        jsonrpc:
          typeof (template as Record<string, unknown>).jsonrpc === "string"
            ? (template as Record<string, unknown>).jsonrpc
            : "2.0",
        id:
          (template as Record<string, unknown>).id !== undefined
            ? (template as Record<string, unknown>).id
            : pageModel.interaction.defaultId || "fastnear",
        method:
          typeof (template as Record<string, unknown>).method === "string"
            ? (template as Record<string, unknown>).method
            : pageModel.interaction.requestMethod || pageModel.info.operationId,
        params: {
          ...baseParams,
          ...(pageModel.interaction.supportsFinality ? { finality } : {}),
          ...(pageModel.interaction.requestType ? { request_type: pageModel.interaction.requestType } : {}),
          ...parsedFieldValues,
        },
      },
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to prepare the RPC request.",
      payload: null,
    };
  }
}

function buildHttpRequestUrl(
  pageModel: FastnearPageModel,
  network: FastnearInteractionNetwork | undefined,
  fieldValues: Record<string, string>,
  auth: ReturnType<typeof usePortalAuth>
) {
  const baseUrl = network?.url || "";
  const resolvedPath = Object.entries(fieldValues).reduce((currentPath, [fieldName, value]) => {
    const field = pageModel.interaction.fields.find((candidate) => candidate.name === fieldName);
    if (field?.location !== "path") {
      return currentPath;
    }

    return currentPath.replace(`{${fieldName}}`, encodeURIComponent(value.trim()));
  }, pageModel.route.path);

  const requestUrl = new URL(resolvedPath, baseUrl);
  for (const field of pageModel.interaction.fields) {
    if (field.location !== "query") {
      continue;
    }

    const value = fieldValues[field.name]?.trim();
    if (value) {
      requestUrl.searchParams.set(field.name, value);
    }
  }

  if (pageModel.interaction.authTransport === "query" && auth.apiKey) {
    requestUrl.searchParams.set("apiKey", auth.apiKey);
  }

  return requestUrl;
}

function buildHttpRequestBody(
  pageModel: FastnearPageModel,
  fieldValues: Record<string, string>
) {
  const bodyEntries = pageModel.interaction.fields
    .filter((field) => field.location === "body")
    .map((field) => {
      const rawValue = fieldValues[field.name] || "";
      const trimmedValue = rawValue.trim();
      if (!trimmedValue) {
        return undefined;
      }

      return [field.name, parseFieldValue(pageModel, field, rawValue)];
    })
    .filter(Boolean) as Array<[string, unknown]>;

  if (bodyEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(bodyEntries);
}

function useEmbedAutoHeight() {
  const lastHeightRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) {
      return undefined;
    }

    let frameId = 0;
    const postHeight = () => {
      const nextHeight = Math.ceil(
        Math.max(
          document.documentElement?.scrollHeight || 0,
          document.body?.scrollHeight || 0,
          document.documentElement?.offsetHeight || 0,
          document.body?.offsetHeight || 0
        )
      );

      if (!nextHeight || Math.abs(nextHeight - lastHeightRef.current) < 2) {
        return;
      }

      lastHeightRef.current = nextHeight;
      window.parent.postMessage(
        {
          type: "fastnear-docs:resize",
          height: nextHeight,
          pathname: window.location.pathname,
        },
        "*"
      );
    };

    const schedulePost = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(postHeight);
    };

    schedulePost();

    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedulePost) : undefined;
    observer?.observe(document.documentElement);
    if (document.body) {
      observer?.observe(document.body);
    }

    window.addEventListener("load", schedulePost);
    window.addEventListener("resize", schedulePost);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }

      observer?.disconnect();
      window.removeEventListener("load", schedulePost);
      window.removeEventListener("resize", schedulePost);
    };
  }, []);
}

export function FastnearOperationPage({
  pageModel,
  surface = "operation",
}: {
  pageModel: FastnearPageModel;
  surface?: "operation" | "standalone" | "markdoc";
}) {
  useEmbedAutoHeight();
  const auth = usePortalAuth();
  const [selectedNetwork, setSelectedNetwork] = useState<string>(() => getInitialNetwork(pageModel));
  const [selectedExampleId, setSelectedExampleId] = useState<string>(
    () =>
      pageModel.request.examples.find((example) => example.network === getInitialNetwork(pageModel))?.id ||
      pageModel.request.examples[0]?.id ||
      ""
  );
  const [selectedFinality, setSelectedFinality] = useState<FinalityKey>("final");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    getDefaultFieldValues(pageModel, getInitialNetwork(pageModel))
  );
  const [fieldModes, setFieldModes] = useState<Record<string, string>>(() =>
    getDefaultFieldModes(pageModel, getInitialNetwork(pageModel))
  );
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [copiedResponse, setCopiedResponse] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const selectedFinalityDetails =
    FINALITY_OPTIONS.find((option) => option.value === selectedFinality) || FINALITY_OPTIONS[2];
  const selectedNetworkDetails =
    pageModel.interaction.networks.find((network) => network.key === selectedNetwork) ||
    pageModel.interaction.networks[0];

  // Present only when generate-page-models.js resolved this network to the
  // archival host, which it does when the operation's EXAMPLE pins a record
  // older than the standard RPC's retention window. It is a property of the
  // example, not of the method, so it is surfaced as a note rather than by
  // relabelling the network.
  const archivalReason =
    selectedNetworkDetails && "archivalReason" in selectedNetworkDetails
      ? (selectedNetworkDetails as { archivalReason?: string }).archivalReason
      : undefined;
  const selectedExample =
    pageModel.request.examples.find((example) => example.id === selectedExampleId) ||
    pageModel.request.examples.find((example) => example.network === selectedNetwork) ||
    pageModel.request.examples[0];

  useEffect(() => {
    setApiKeyDraft(auth.storedApiKey || "");
  }, [auth.storedApiKey]);

  useEffect(() => {
    const matchingExample = pageModel.request.examples.find((example) => example.network === selectedNetwork);
    setSelectedExampleId(matchingExample?.id || pageModel.request.examples[0]?.id || "");
    setFieldValues(getDefaultFieldValues(pageModel, selectedNetwork));
    setFieldModes(getDefaultFieldModes(pageModel, selectedNetwork));
  }, [pageModel, selectedNetwork]);

  useEffect(() => {
    const runtimeDefaults = RUNTIME_FIELD_DEFAULTS[pageModel.pageModelId];
    if (!runtimeDefaults || !selectedNetworkDetails?.url) {
      return;
    }

    const targetFields = runtimeDefaults.targetFieldNames
      .map((fieldName) => pageModel.interaction.fields.find((field) => field.name === fieldName))
      .filter(Boolean) as FastnearInteractionField[];
    if (targetFields.length === 0) {
      return;
    }

    const expectedDefaultValues = Object.fromEntries(
      targetFields.map((field) => [
        field.name,
        getDefaultFieldValue(pageModel, field, selectedNetwork).trim(),
      ])
    );
    const controller = new AbortController();

    void (async () => {
      const nextDefaultFields = await runtimeDefaults.fetchDefaults(
        selectedNetworkDetails.url,
        selectedNetwork,
        controller.signal
      );

      if (!nextDefaultFields) {
        return;
      }

      setFieldValues((currentValues) => {
        let didChange = false;
        const updatedValues = { ...currentValues };

        for (const field of targetFields) {
          const currentValue = (currentValues[field.name] || "").trim();
          const expectedDefaultValue = expectedDefaultValues[field.name] || "";
          const nextValue = serializeFieldDraftValue(
            pageModel,
            field,
            nextDefaultFields[field.name]
          ).trim();
          if (!nextValue) {
            continue;
          }

          if (currentValue && currentValue !== expectedDefaultValue) {
            continue;
          }

          if (currentValue !== nextValue) {
            updatedValues[field.name] = nextValue;
            didChange = true;
          }
        }

        return didChange ? updatedValues : currentValues;
      });
    })();

    return () => controller.abort();
  }, [pageModel, selectedNetwork, selectedNetworkDetails]);

  useEffect(() => {
    if (!copiedCurl) {
      return;
    }

    const timeout = window.setTimeout(() => setCopiedCurl(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copiedCurl]);

  useEffect(() => {
    if (!copiedResponse) {
      return;
    }

    const timeout = window.setTimeout(() => setCopiedResponse(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copiedResponse]);

  const trimmedFieldValues = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(fieldValues).map(([key, value]) => [key, value.trim()])
      ),
    [fieldValues]
  );
  const requestUrl =
    pageModel.route.transport === "http"
      ? buildHttpRequestUrl(pageModel, selectedNetworkDetails, trimmedFieldValues, auth)
      : undefined;
  const httpRequestBody =
    pageModel.route.transport === "http"
      ? buildHttpRequestBody(pageModel, fieldValues)
      : undefined;
  const rpcPayload =
    pageModel.route.transport === "json-rpc"
      ? buildRpcPayload(
          pageModel,
          trimmedFieldValues,
          fieldModes,
          selectedFinality,
          selectedExample?.request?.body
        )
      : undefined;
  const rpcPayloadValue = pageModel.route.transport === "json-rpc" ? rpcPayload?.payload : undefined;
  const rpcPayloadError = pageModel.route.transport === "json-rpc" ? rpcPayload?.error : null;
  const missingField = pageModel.interaction.fields.find(
    (field) => field.required && !trimmedFieldValues[field.name]
  );
  const curlCommand = useMemo(() => {
    const lines: string[] = [];

    if (pageModel.route.transport === "json-rpc") {
      if (!selectedNetworkDetails?.url || !rpcPayloadValue) {
        return "";
      }

      lines.push(`curl -s '${escapeShellSingleQuotes(selectedNetworkDetails.url)}'`);
      lines.push("  -X POST");
      lines.push(`  ${stringifyCurlHeader("Accept", "application/json")}`);
      lines.push(`  ${stringifyCurlHeader("Content-Type", "application/json")}`);
      if (pageModel.interaction.authTransport === "bearer" && auth.apiKey) {
        lines.push(`  ${stringifyCurlHeader("Authorization", `Bearer ${auth.apiKey}`)}`);
      }
      lines.push(`  --data-raw '${escapeShellSingleQuotes(JSON.stringify(rpcPayloadValue))}'`);
      lines.push("  | jq");
      return lines.join(" \\\n");
    }

    if (!requestUrl) {
      return "";
    }

    lines.push(`curl -s '${escapeShellSingleQuotes(requestUrl.toString())}'`);
    lines.push(`  -X ${pageModel.route.method}`);
    lines.push(`  ${stringifyCurlHeader("Accept", "application/json")}`);
    if (httpRequestBody) {
      lines.push(`  ${stringifyCurlHeader("Content-Type", pageModel.request.mediaType || "application/json")}`);
    }
    if (pageModel.interaction.authTransport === "bearer" && auth.apiKey) {
      lines.push(`  ${stringifyCurlHeader("Authorization", `Bearer ${auth.apiKey}`)}`);
    }
    if (httpRequestBody) {
      lines.push(`  --data-raw '${escapeShellSingleQuotes(JSON.stringify(httpRequestBody))}'`);
    }
    lines.push("  | jq");
    return lines.join(" \\\n");
  }, [
    auth.apiKey,
    httpRequestBody,
    pageModel,
    requestUrl,
    rpcPayloadValue,
    selectedNetworkDetails?.url,
  ]);

  const apiKeyStatus = getPortalApiKeyStatus(auth);
  const isUrlApiKeyOverride = auth.apiKeySource === "url";
  const effectiveAuthSummary = getPortalAuthSummary(auth, pageModel.interaction.authTransport);
  const apiKeyInputValue = isUrlApiKeyOverride ? auth.urlApiKey || "" : apiKeyDraft;
  const canSaveApiKey =
    !isUrlApiKeyOverride &&
    !!apiKeyDraft.trim() &&
    apiKeyDraft.trim() !== (auth.storedApiKey || "");
  const canClearStoredApiKey = !isUrlApiKeyOverride && !!auth.storedApiKey;
  const hasRpcError = runResult?.kind === "json" && !!runResult.value?.error;
  const runResultText = useMemo(() => getRunResultText(runResult), [runResult]);

  const handleNetworkChange = (networkKey: string) => {
    setSelectedNetwork(networkKey);
    setRunError(null);
    setRunResult(null);
    setCopiedResponse(false);
  };

  const handleFinalityChange = (finality: FinalityKey) => {
    setSelectedFinality(finality);
    setRunError(null);
    setRunResult(null);
    setCopiedResponse(false);
  };

  const handleFieldChange = (fieldName: string, value: string) => {
    setFieldValues((currentValues) => ({
      ...currentValues,
      [fieldName]: value,
    }));
    setRunError(null);
    setRunResult(null);
    setCopiedResponse(false);
  };

  const handleFieldModeChange = (field: FastnearInteractionField, nextMode: string) => {
    const fieldAdapter = getFieldAdapter(pageModel.pageModelId, field.name);
    if (!fieldAdapter) {
      return;
    }

    const previousMode = fieldModes[field.name] || fieldAdapter.defaultMode;
    const currentValue = fieldValues[field.name] || "";
    let nextValue = currentValue;

    try {
      const wireValue = parseFieldValue(pageModel, field, currentValue, previousMode);
      nextValue = serializeFieldDraftValue(pageModel, field, wireValue, nextMode);
    } catch {}

    setFieldModes((currentModes) => ({
      ...currentModes,
      [field.name]: nextMode,
    }));
    setFieldValues((currentValues) => ({
      ...currentValues,
      [field.name]: nextValue,
    }));
    setRunError(null);
    setRunResult(null);
    setCopiedResponse(false);
  };

  const handleExampleSelect = (exampleId: string) => {
    const example = pageModel.request.examples.find((candidate) => candidate.id === exampleId);
    if (!example) {
      return;
    }

    setSelectedExampleId(example.id);
    if (example.network) {
      setSelectedNetwork(example.network);
    }

    const rpcExampleBody =
      pageModel.route.transport === "json-rpc" &&
      example.request?.body &&
      typeof example.request.body === "object" &&
      !Array.isArray(example.request.body)
        ? (example.request.body as Record<string, unknown>)
        : undefined;
    const rpcExampleParams =
      rpcExampleBody?.params &&
      typeof rpcExampleBody.params === "object" &&
      !Array.isArray(rpcExampleBody.params)
        ? (rpcExampleBody.params as Record<string, unknown>)
        : {};
    const nextFieldValues = {
      ...getDefaultFieldValues(pageModel, example.network || selectedNetwork),
      ...(pageModel.route.transport === "json-rpc" ? rpcExampleParams : example.request?.body || {}),
      ...(example.request?.path || {}),
      ...(example.request?.query || {}),
    };
    const nextFieldModes = getFieldModesFromWireValues(pageModel, nextFieldValues);
    setFieldModes(nextFieldModes);
    setFieldValues(
      Object.fromEntries(
        Object.entries(nextFieldValues).map(([key, value]) => {
          const field = pageModel.interaction.fields.find((candidate) => candidate.name === key);
          return [
            key,
            field
              ? serializeFieldDraftValue(pageModel, field, value, nextFieldModes[field.name])
              : String(value),
          ];
        })
      )
    );
  };

  const handleRun = async () => {
    if (missingField) {
      setRunError(
        `Enter ${
          (getFieldAdapter(pageModel.pageModelId, missingField.name)?.displayLabel || missingField.label).toLowerCase()
        } before running the request.`
      );
      return;
    }

    if (rpcPayloadError) {
      setRunError(rpcPayloadError);
      return;
    }

    try {
      setIsRunning(true);
      setRunError(null);
      setCopiedResponse(false);

      if (pageModel.route.transport === "json-rpc") {
        if (!selectedNetworkDetails?.url || !rpcPayloadValue) {
          throw new Error("No RPC server is configured for the selected network.");
        }

        const headers: Record<string, string> = {
          Accept: "application/json",
          "Content-Type": "application/json",
        };
        if (pageModel.interaction.authTransport === "bearer" && auth.apiKey) {
          headers.Authorization = `Bearer ${auth.apiKey}`;
        }

        const response = await fetch(selectedNetworkDetails.url, {
          body: JSON.stringify(rpcPayloadValue),
          headers,
          method: "POST",
        });
        const responseText = await response.text();
        try {
          setRunResult({
            kind: "json",
            ok: response.ok,
            status: response.status,
            url: selectedNetworkDetails.url,
            value: JSON.parse(responseText),
          });
        } catch (_error) {
          setRunResult({
            kind: "text",
            ok: response.ok,
            status: response.status,
            url: selectedNetworkDetails.url,
            value: responseText,
          });
        }
        return;
      }

      if (!requestUrl) {
        throw new Error("No API server is configured for the selected network.");
      }

      const headers: Record<string, string> = {
        Accept: "application/json",
      };
      if (httpRequestBody) {
        headers["Content-Type"] = pageModel.request.mediaType || "application/json";
      }
      if (pageModel.interaction.authTransport === "bearer" && auth.apiKey) {
        headers.Authorization = `Bearer ${auth.apiKey}`;
      }

      const response = await fetch(requestUrl.toString(), {
        body: httpRequestBody ? JSON.stringify(httpRequestBody) : undefined,
        headers,
        method: pageModel.route.method,
      });
      const responseText = await response.text();
      try {
        setRunResult({
          kind: "json",
          ok: response.ok,
          status: response.status,
          url: requestUrl.toString(),
          value: JSON.parse(responseText),
        });
      } catch (_error) {
        setRunResult({
          kind: "text",
          ok: response.ok,
          status: response.status,
          url: requestUrl.toString(),
          value: responseText,
        });
      }
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Request failed.");
      setRunResult(null);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className={`fastnear-operation-page fastnear-operation-page--${surface}`}>
      <div className={`fastnear-interaction fastnear-interaction--${surface}`}>
        <div className="fastnear-interaction__layout">
          <div className="fastnear-interaction__sidebar">
            <div className="fastnear-interaction__controls">
              <div className="fastnear-interaction__field fastnear-interaction__field--network">
                <span className="fastnear-interaction__label">Network</span>
                <div
                  className="fastnear-segmented fastnear-segmented--network"
                  role="tablist"
                  aria-label="Select network"
                >
                  {pageModel.interaction.networks.map((network) => (
                    <button
                      key={network.key || network.label}
                      type="button"
                      className={network.key === selectedNetwork ? "is-active" : ""}
                      onClick={() => handleNetworkChange(network.key || selectedNetwork)}
                      aria-pressed={network.key === selectedNetwork}
                    >
                      {network.label}
                    </button>
                  ))}
                </div>
              </div>

              {pageModel.interaction.fields.map((field) => {
                const fieldAdapter = getFieldAdapter(pageModel.pageModelId, field.name);
                const enumOptions = getEnumOptions(field);
                const isBoolean = isBooleanField(field);
                const isMultiline = isMultilineField(pageModel, field);
                const value = fieldValues[field.name] || "";
                const fieldMode = fieldModes[field.name] || fieldAdapter?.defaultMode || "";
                const fieldLabel = getDisplayFieldLabel(pageModel, field);
                const fieldHelperText = getFieldAdapterHelperText(pageModel, field, fieldMode);
                const placeholder = getDefaultFieldValue(pageModel, field, selectedNetwork);

                if (isBoolean) {
                  const options = field.required
                    ? [
                        { label: "True", value: "true" },
                        { label: "False", value: "false" },
                      ]
                    : [
                        { label: "Unset", value: "" },
                        { label: "True", value: "true" },
                        { label: "False", value: "false" },
                      ];

                  return (
                    <div
                      key={field.name}
                      className={`fastnear-interaction__field fastnear-interaction__field--${field.name}`}
                    >
                      <span className="fastnear-interaction__label">{fieldLabel}</span>
                      {getFieldLocationLabel(field) ? (
                        <span className="fastnear-interaction__field-hint">
                          {getFieldLocationLabel(field)}
                        </span>
                      ) : null}
                      <div
                        className="fastnear-segmented fastnear-segmented--boolean"
                        role="tablist"
                        aria-label={`Select ${fieldLabel}`}
                      >
                        {options.map((option) => (
                          <button
                            key={`${field.name}-${option.value || "unset"}`}
                            type="button"
                            className={option.value === value ? "is-active" : ""}
                            onClick={() => handleFieldChange(field.name, option.value)}
                            aria-pressed={option.value === value}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      {fieldHelperText ? (
                        <p className="fastnear-interaction__field-note">{fieldHelperText}</p>
                      ) : null}
                    </div>
                  );
                }

                if (enumOptions.length > 0 && enumOptions.length <= 3) {
                  const options = field.required
                    ? enumOptions.map((option) => ({
                        label: formatChoiceLabel(option),
                        value: option,
                      }))
                    : [{ label: "Any", value: "" }].concat(
                        enumOptions.map((option) => ({
                          label: formatChoiceLabel(option),
                          value: option,
                        }))
                      );

                  return (
                    <div
                      key={field.name}
                      className={`fastnear-interaction__field fastnear-interaction__field--${field.name}`}
                    >
                      <span className="fastnear-interaction__label">{fieldLabel}</span>
                      {getFieldLocationLabel(field) ? (
                        <span className="fastnear-interaction__field-hint">
                          {getFieldLocationLabel(field)}
                        </span>
                      ) : null}
                      <div className="fastnear-segmented" role="tablist" aria-label={`Select ${fieldLabel}`}>
                        {options.map((option) => (
                          <button
                            key={`${field.name}-${option.value || "any"}`}
                            type="button"
                            className={option.value === value ? "is-active" : ""}
                            onClick={() => handleFieldChange(field.name, option.value)}
                            aria-pressed={option.value === value}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      {fieldHelperText ? (
                        <p className="fastnear-interaction__field-note">{fieldHelperText}</p>
                      ) : null}
                    </div>
                  );
                }

                if (isMultiline) {
                  return (
                    <label
                      key={field.name}
                      className={`fastnear-interaction__field fastnear-interaction__field--${field.name}`}
                    >
                      <span className="fastnear-interaction__label">{fieldLabel}</span>
                      {getFieldLocationLabel(field) ? (
                        <span className="fastnear-interaction__field-hint">
                          {getFieldLocationLabel(field)}
                        </span>
                      ) : null}
                      {fieldAdapter?.modes?.length ? (
                        <div
                          className="fastnear-segmented fastnear-segmented--field-mode"
                          role="tablist"
                          aria-label={`Select ${fieldLabel} mode`}
                        >
                          {fieldAdapter.modes.map((option) => (
                            <button
                              key={`${field.name}-${option.value}`}
                              type="button"
                              className={option.value === fieldMode ? "is-active" : ""}
                              onClick={() => handleFieldModeChange(field, option.value)}
                              aria-pressed={option.value === fieldMode}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <textarea
                        className="fastnear-interaction__input fastnear-interaction__input--code fastnear-interaction__input--multiline"
                        value={value}
                        onChange={(event) => handleFieldChange(field.name, event.target.value)}
                        placeholder={placeholder}
                        rows={Math.max(3, Math.min(6, placeholder ? placeholder.split("\n").length : 4))}
                        spellCheck={false}
                      />
                      {fieldHelperText ? (
                        <p className="fastnear-interaction__field-note">{fieldHelperText}</p>
                      ) : null}
                    </label>
                  );
                }

                return (
                  <label
                    key={field.name}
                    className={`fastnear-interaction__field fastnear-interaction__field--${field.name}`}
                  >
                    <span className="fastnear-interaction__label">{fieldLabel}</span>
                    {getFieldLocationLabel(field) ? (
                      <span className="fastnear-interaction__field-hint">
                        {getFieldLocationLabel(field)}
                      </span>
                    ) : null}
                    {fieldAdapter?.modes?.length ? (
                      <div
                        className="fastnear-segmented fastnear-segmented--field-mode"
                        role="tablist"
                        aria-label={`Select ${fieldLabel} mode`}
                      >
                        {fieldAdapter.modes.map((option) => (
                          <button
                            key={`${field.name}-${option.value}`}
                            type="button"
                            className={option.value === fieldMode ? "is-active" : ""}
                            onClick={() => handleFieldModeChange(field, option.value)}
                            aria-pressed={option.value === fieldMode}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <input
                      className="fastnear-interaction__input fastnear-interaction__input--code"
                      value={value}
                      onChange={(event) => handleFieldChange(field.name, event.target.value)}
                      placeholder={placeholder}
                      autoComplete="off"
                      spellCheck={false}
                      inputMode={
                        fieldSupportsType(field, "integer") || fieldSupportsType(field, "number")
                          ? "numeric"
                          : undefined
                      }
                    />
                    {fieldHelperText ? (
                      <p className="fastnear-interaction__field-note">{fieldHelperText}</p>
                    ) : null}
                  </label>
                );
              })}
            </div>

            <div className="fastnear-interaction__auth">
              <div className="fastnear-interaction__auth-heading">
                <span className="fastnear-interaction__label">FastNear API key</span>
                <span
                  className={`fastnear-interaction__auth-status ${
                    isUrlApiKeyOverride
                      ? "fastnear-interaction__auth-status--url"
                      : auth.storedApiKey
                        ? "fastnear-interaction__auth-status--saved"
                        : "fastnear-interaction__auth-status--empty"
                  }`}
                >
                  {apiKeyStatus}
                </span>
              </div>

              <input
                className="fastnear-interaction__input fastnear-interaction__input--code"
                value={apiKeyInputValue}
                onChange={(event) => setApiKeyDraft(event.target.value)}
                placeholder="Paste FastNear API key"
                autoComplete="off"
                spellCheck={false}
                readOnly={isUrlApiKeyOverride}
                aria-readonly={isUrlApiKeyOverride}
              />

              <a
                className="fastnear-interaction__helper-link"
                href="https://dashboard.fastnear.com"
                target="_blank"
                rel="noreferrer"
              >
                <span>Get API key</span>
                <ExternalLinkGlyph className="fastnear-interaction__helper-link-icon" />
              </a>

              {canSaveApiKey || canClearStoredApiKey ? (
                <div className="fastnear-interaction__auth-actions">
                  {canSaveApiKey ? (
                    <button
                      type="button"
                      className="fastnear-button fastnear-button--secondary"
                      onClick={() => setPortalApiKey(apiKeyDraft)}
                    >
                      Save API key
                    </button>
                  ) : null}
                  {canClearStoredApiKey ? (
                    <button
                      type="button"
                      className="fastnear-button fastnear-button--ghost"
                      onClick={() => {
                        clearPortalApiKey();
                        setApiKeyDraft("");
                      }}
                    >
                      Remove saved key
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="fastnear-interaction__actions">
              <button
                type="button"
                className="fastnear-button fastnear-button--primary"
                onClick={handleRun}
                disabled={isRunning || !!missingField}
              >
                {isRunning ? "Sending..." : "Send request"}
              </button>
              <button
                type="button"
                className="fastnear-button fastnear-button--secondary"
                onClick={async () => {
                  if (!curlCommand) {
                    return;
                  }

                  await copyText(curlCommand);
                  setCopiedCurl(true);
                }}
                disabled={!curlCommand}
              >
                {copiedCurl ? "Copied curl command" : "Copy curl command"}
              </button>
            </div>

            <div className="fastnear-interaction__meta">
              <div className="fastnear-interaction__meta-item">
                <span className="fastnear-interaction__meta-label">Endpoint</span>
                <code>
                  {pageModel.route.transport === "json-rpc"
                    ? selectedNetworkDetails?.url
                    : requestUrl?.origin || selectedNetworkDetails?.url}
                </code>
                {archivalReason ? (
                  <p className="fastnear-interaction__meta-note">
                    Archival endpoint — {archivalReason} The method itself works on the
                    standard RPC for recent data.
                  </p>
                ) : null}
              </div>
              {pageModel.interaction.supportsFinality ? (
                <div className="fastnear-interaction__meta-item fastnear-interaction__meta-item--finality">
                  <span className="fastnear-interaction__meta-label">Finality</span>
                  <div
                    className="fastnear-segmented fastnear-segmented--finality"
                    role="tablist"
                    aria-label="Select finality"
                  >
                    {FINALITY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={option.value === selectedFinality ? "is-active" : ""}
                        onClick={() => handleFinalityChange(option.value)}
                        aria-pressed={option.value === selectedFinality}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="fastnear-interaction__meta-help">
                    {selectedFinalityDetails.description}
                  </p>
                </div>
              ) : null}
              <div className="fastnear-interaction__meta-item">
                <span className="fastnear-interaction__meta-label">Auth</span>
                <span className="fastnear-interaction__meta-value">{effectiveAuthSummary}</span>
              </div>
            </div>
          </div>

          <div className="fastnear-interaction__response">
            <div className="fastnear-interaction__response-header">
              <div className="fastnear-interaction__response-heading">
                <span className="fastnear-interaction__label">Live Response</span>
                <p className="fastnear-interaction__response-copy">
                  Responses from the selected endpoint appear here after you run a request.
                </p>
              </div>
            </div>

            <div className="fastnear-interaction__response-body">
              {runError ? <p className="fastnear-interaction__error">{runError}</p> : null}

              {runResult ? (
                <>
                  <div className="fastnear-interaction__result-meta">
                    <span
                      className={`fastnear-interaction__status ${
                        runResult.ok && !hasRpcError
                          ? "fastnear-interaction__status--success"
                          : "fastnear-interaction__status--error"
                      }`}
                    >
                      {runResult.ok && !hasRpcError ? "Success" : "Error"}
                    </span>
                    <span>HTTP {runResult.status}</span>
                    <code className="fastnear-interaction__result-url">{runResult.url}</code>
                  </div>

                  <div className="fastnear-interaction__result-shell">
                    <button
                      type="button"
                      className={`fastnear-interaction__copy-button ${
                        copiedResponse ? "is-copied" : ""
                      }`}
                      onClick={async () => {
                        if (!runResultText) {
                          return;
                        }

                        await copyText(runResultText);
                        setCopiedResponse(true);
                      }}
                      aria-label={copiedResponse ? "Response copied" : "Copy response"}
                      title={copiedResponse ? "Response copied" : "Copy response"}
                    >
                      {copiedResponse ? (
                        <CheckGlyph className="fastnear-interaction__copy-icon" />
                      ) : (
                        <CopyGlyph className="fastnear-interaction__copy-icon" />
                      )}
                    </button>
                    <pre className="fastnear-interaction__text-response">
                      {runResultText}
                    </pre>
                  </div>
                </>
              ) : (
                <p className="fastnear-interaction__placeholder fastnear-interaction__placeholder--panel">
                  Live response output will appear here after you run a request.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <FastnearOperationReference
        className="fastnear-operation-page__reference"
        pageModel={pageModel}
        selectedExampleId={selectedExampleId}
        onExampleSelect={handleExampleSelect}
      />
    </div>
  );
}
