/** Failed local-server response with its HTTP status retained for callers. */
export class TabVaultApiError extends Error {
  readonly status: number;

  /**
   * Preserve the status of one failed local-server request.
   * @param {number} status - HTTP response status.
   * @param {string} message - User-facing or diagnostic failure text.
   */
  constructor(status: number, message: string) {
    super(message);
    this.name = "TabVaultApiError";
    this.status = status;
  }
}

/**
 * Build JSON headers for authenticated local-server requests.
 * @param {string} apiKey - Credential for the trusted local API.
 * @returns {{ "content-type": string; "X-API-Key": string }} Request headers.
 */
export function apiHeaders(apiKey: string) {
  return {
    "content-type": "application/json",
    "X-API-Key": apiKey,
  };
}

type ApiConfig = { baseUrl: string; apiKey: string; signal?: AbortSignal };

/**
 * Create a configured client for the local TabVault HTTP API.
 *
 * @param {ApiConfig} config - Runtime-editable server origin and API key.
 * @returns {TabVaultApi} Domain-grouped operations with shared request and error handling.
 */
export function createTabVaultApi(config: ApiConfig) {
  const root = config.baseUrl.replace(/\/+$/, "");
  const headers = apiHeaders(config.apiKey);

  /**
   * Send one authenticated request and retain the raw response for binary exports.
   * @param {string} path - API path after `/api/v1`.
   * @param {RequestInit} init - Optional method, body, and header overrides.
   * @returns {Promise<Response>} Successful HTTP response.
   * @throws {TabVaultApiError} When the server returns a non-success status.
   */
  async function raw(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(`${root}/api/v1${path}`, {
      signal: config.signal,
      ...init,
      headers: { ...headers, ...init.headers },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message =
        typeof body?.detail === "string"
          ? body.detail
          : body?.errors?.[0]?.message;
      throw new TabVaultApiError(
        response.status,
        message || `Request failed (${response.status})`
      );
    }
    return response;
  }

  /**
   * Parse a successful local-server JSON response as the caller's wire type.
   * @template T - Expected response payload.
   * @param {string} path - API path after `/api/v1`.
   * @param {RequestInit} init - Optional method, body, and header overrides.
   * @returns {Promise<T>} Parsed response payload.
   * @throws {TabVaultApiError} When the request returns a non-success status.
   */
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await raw(path, init);
    return response.json() as Promise<T>;
  }

  return {
    request,
    transfer: {
      export: (format: "json" | "markdown") => raw(`/export?format=${format}`),
      import: <T>(body: unknown) =>
        request<T>("/import", { method: "POST", body: JSON.stringify(body) }),
      validate: <T>(body: unknown) =>
        request<T>("/import/validate", {
          method: "POST",
          body: JSON.stringify(body),
        }),
    },
  };
}

export type TabVaultApi = ReturnType<typeof createTabVaultApi>;
