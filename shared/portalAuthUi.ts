export type PortalApiKeySource = "url" | "storage" | undefined;
export type PortalAuthTransport = "bearer" | "query";

type PortalAuthUiState = {
  apiKey?: string;
  apiKeySource?: PortalApiKeySource;
  storedApiKey?: string;
};

export function getPortalApiKeyStatus(auth: {
  apiKeySource?: PortalApiKeySource;
  storedApiKey?: string;
}) {
  if (auth.apiKeySource === "url") {
    return "From URL override";
  }

  if (auth.storedApiKey) {
    return "Saved in browser";
  }

  return "No saved key";
}

export function getPortalAuthSummary(
  auth: PortalAuthUiState,
  authTransport: PortalAuthTransport
) {
  if (!auth.apiKey) {
    return "none detected";
  }

  if (authTransport === "bearer") {
    return auth.apiKeySource === "url"
      ? "API key from URL via Bearer auth"
      : "saved browser API key via Bearer auth";
  }

  return auth.apiKeySource === "url"
    ? "API key from URL via query param"
    : "saved browser API key via query param";
}
