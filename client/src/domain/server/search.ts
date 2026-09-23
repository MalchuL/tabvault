/** Local-server search, index status, and capability operations. */

import { DEFAULT_TABVAULT_API_KEY } from "./browserStorage";
import { apiHeaders } from "./client";
import { ensureViewedProperty } from "./propertySchema";
import type { LocalServerTab } from "./libraryApi";

export type LocalSearchResponse = {
  mode: "semantic" | "text_fallback";
  query: string;
  group?: string | null;
  results: Array<{ tab: LocalServerTab; score: number }>;
  semanticIndex?: {
    status: string;
    indexedTabs: number;
    model?: string;
    lastError?: string | null;
  };
};

export type SemanticIndexStatus = {
  status: "ready" | "not_ready" | "indexing" | "unavailable";
  indexedTabs: number;
  provider: string;
  model: string;
  baseUrl: string;
  batchSize?: number;
  progress?: {
    state: string;
    total: number;
    processed: number;
    batches: number;
  };
  lastError?: string | null;
  healthCheck?: IndexHealthCheck;
};

export type ServerCapability = {
  available: boolean;
  error?: string | null;
  fix?: string | null;
};

export type ServerCapabilities = {
  keywordSearch: ServerCapability;
  semanticSearch: ServerCapability;
  vectorIndex: ServerCapability;
};

export type BackgroundJob = {
  id: string;
  status: "pending" | "running" | "done" | "failed";
  progress: number;
  error?: string | null;
};

type SemanticIndexStatusWire = Partial<SemanticIndexStatus> & {
  indexedCount?: number;
};

export type IndexHealthCheck = {
  enabled: boolean;
  intervalSeconds: number;
  lastCheck?: string | null;
  lastResult?: "ready" | "needs_attention" | null;
  notifyOnNeedsAttention?: boolean;
  lastAlert?: string | null;
};

/**
 * Normalize health or index-status payloads onto the UI field names.
 *
 * The local server reports `vectorIndex` and `indexedCount`; older clients and
 * copy still use `semanticIndex` and `indexedTabs`.
 *
 * @param {SemanticIndexStatusWire | null} raw - Health or `/index/status` fragment from the local server.
 * @returns {SemanticIndexStatus | null} A UI-ready index status, or `null` when the payload is missing.
 */
export function normalizeSemanticIndexStatus(
  raw?: SemanticIndexStatusWire | null
): SemanticIndexStatus | null {
  if (!raw) return null;
  return {
    status: raw.status ?? "not_ready",
    indexedTabs: raw.indexedTabs ?? raw.indexedCount ?? 0,
    provider: raw.provider ?? "sentence-transformers",
    model: raw.model ?? "",
    baseUrl: raw.baseUrl ?? "",
    batchSize: raw.batchSize,
    progress: raw.progress,
    lastError: raw.lastError,
    healthCheck: raw.healthCheck,
  };
}

/**
 * Choose the capability the operator should see first.
 *
 * Runtime install problems take priority over an empty index so Dashboard can
 * show the missing `sentence-transformers` extra before a rebuild is attempted.
 *
 * @param {ServerCapabilities | null} capabilities - Latest `/capabilities` snapshot, if the server is online.
 * @returns {ServerCapability | null} The blocking capability, or `null` when both features are available.
 */
export function blockingSearchCapability(
  capabilities?: ServerCapabilities | null
): ServerCapability | null {
  if (!capabilities) return null;
  if (!capabilities.semanticSearch.available)
    return capabilities.semanticSearch;
  if (!capabilities.vectorIndex.available) return capabilities.vectorIndex;
  return null;
}

/**
 * Verify local-server health and ensure the viewed property schema exists.
 * The schema check can write server metadata before returning health details.
 * @param {string} url - Configured local-server base URL.
 * @param {string} apiKey - Local-server API key.
 * @returns {Promise<{ status: string; schemaVersion: number; semanticIndex: SemanticIndexStatus | null; vectorIndex?: SemanticIndexStatusWire }>} Health payload with normalized semantic-index status.
 * @throws {Error} When the health request fails or the viewed schema cannot be ensured.
 */
export async function checkLocalServer(
  url: string,
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  const response = await fetch(`${url.replace(/\/+$/, "")}/api/v1/health`, {
    headers: apiHeaders(apiKey),
  });
  if (!response.ok)
    throw new Error("Local server did not return a healthy status");
  await ensureViewedProperty(url, apiKey);
  const payload = (await response.json()) as {
    status: string;
    schemaVersion: number;
    semanticIndex?: SemanticIndexStatusWire;
    vectorIndex?: SemanticIndexStatusWire;
  };
  return {
    ...payload,
    semanticIndex: normalizeSemanticIndexStatus(
      payload.semanticIndex ?? payload.vectorIndex
    ),
  };
}

/**
 * Read which local-server features are available in this process.
 *
 * @param {string} url - Configured local-server base URL.
 * @param {string} apiKey - Local-server API key.
 * @returns {Promise<ServerCapabilities>} Named capability records, including error and fix text when needed.
 * @throws {Error} When the capabilities endpoint fails.
 */
export async function getServerCapabilities(
  url: string,
  apiKey = DEFAULT_TABVAULT_API_KEY
): Promise<ServerCapabilities> {
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/api/v1/capabilities`,
    { headers: apiHeaders(apiKey) }
  );
  if (!response.ok)
    throw new Error("TabVault local server could not report capabilities");
  const payload = (await response.json()) as { data: ServerCapabilities };
  return payload.data;
}

/**
 * Search saved tabs, optionally restricting results to one group.
 * @param {string} url - Configured local-server base URL.
 * @param {string} query - Search text sent as the `q` parameter.
 * @param {string | undefined} group - Optional group ID filter.
 * @param {string} apiKey - Local-server API key.
 * @returns {Promise<LocalSearchResponse>} Search results in the UI response shape.
 * @throws {Error} When the search endpoint fails.
 */
export async function searchLocalServer(
  url: string,
  query: string,
  group?: string,
  apiKey = DEFAULT_TABVAULT_API_KEY
): Promise<LocalSearchResponse> {
  const parameters = new URLSearchParams({ q: query });
  if (group) parameters.set("groupId", group);
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/api/v1/search?${parameters}`,
    { headers: apiHeaders(apiKey) }
  );
  if (!response.ok)
    throw new Error("TabVault local server could not search the library");
  const payload = (await response.json()) as {
    data: { results: LocalSearchResponse["results"] };
    meta?: Record<string, unknown>;
    warnings?: Array<{ code?: string }>;
  };
  return {
    mode: payload.warnings?.some(
      warning => warning.code === "W_SEMANTIC_UNAVAILABLE"
    )
      ? "text_fallback"
      : "semantic",
    query,
    group: group ?? null,
    results: payload.data.results,
  };
}

/**
 * Read and normalize the current semantic-index state.
 * @param {string} url - Configured local-server base URL.
 * @param {string} apiKey - Local-server API key.
 * @returns {Promise<SemanticIndexStatus>} Status in the UI field names.
 * @throws {Error} When the endpoint fails or returns no status.
 */
export async function getSemanticIndexStatus(
  url: string,
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/api/v1/index/status`,
    {
      headers: apiHeaders(apiKey),
    }
  );
  if (!response.ok)
    throw new Error("TabVault local server could not read index status");
  const payload = (await response.json()) as { data: SemanticIndexStatusWire };
  const status = normalizeSemanticIndexStatus(payload.data);
  if (!status)
    throw new Error("TabVault local server returned an empty index status");
  return status;
}

/**
 * Read one background job queued by the local server.
 *
 * @param {string} url - Configured local-server base URL.
 * @param {string} jobId - Identifier returned by a 202 queue response.
 * @param {string} apiKey - Local-server API key.
 * @returns {Promise<BackgroundJob>} The current job status, progress, and optional error.
 * @throws {Error} When the job lookup fails.
 */
export async function getBackgroundJob(
  url: string,
  jobId: string,
  apiKey = DEFAULT_TABVAULT_API_KEY
): Promise<BackgroundJob> {
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/api/v1/jobs/${encodeURIComponent(jobId)}`,
    { headers: apiHeaders(apiKey) }
  );
  if (!response.ok)
    throw new Error("TabVault local server could not read the job");
  const payload = (await response.json()) as { data: BackgroundJob };
  return payload.data;
}

/**
 * Queue an index rebuild and return the latest status.
 * If a job ID is returned, wait briefly and surface an immediate job failure;
 * longer rebuilds continue on the server after this function returns.
 * @param {string} url - Configured local-server base URL.
 * @param {string} apiKey - Local-server API key.
 * @returns {Promise<SemanticIndexStatus>} Status after the rebuild request.
 * @throws {Error} When queuing fails or the first job check reports failure.
 */
export async function rebuildSemanticIndex(
  url: string,
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/api/v1/search/reindex`,
    {
      method: "POST",
      headers: apiHeaders(apiKey),
    }
  );
  if (!response.ok)
    throw new Error(
      "TabVault local server could not rebuild the semantic index"
    );
  const queued = (await response.json()) as { data?: { jobId?: string } };
  const jobId = queued.data?.jobId;
  if (jobId) {
    await new Promise(resolve => window.setTimeout(resolve, 200));
    const job = await getBackgroundJob(url, jobId, apiKey);
    if (job.status === "failed") {
      throw new Error(job.error ?? "Index rebuild failed");
    }
  }
  return getSemanticIndexStatus(url, apiKey);
}

/**
 * Load health, capabilities, and index status for Dashboard and Settings.
 *
 * @param {string} url - Configured local-server base URL.
 * @param {string} apiKey - Local-server API key.
 * @returns {Promise<{ online: boolean; schemaVersion: number; capabilities: ServerCapabilities | null; indexStatus: SemanticIndexStatus | null; }>} Online flag plus the latest capability and index snapshots.
 */
export async function loadServerSearchState(
  url: string,
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  const health = await checkLocalServer(url, apiKey);
  const [capabilities, indexStatus] = await Promise.all([
    getServerCapabilities(url, apiKey).catch(() => null),
    getSemanticIndexStatus(url, apiKey).catch(() => health.semanticIndex),
  ]);
  return {
    online: health.status === "ok",
    schemaVersion: health.schemaVersion,
    capabilities,
    indexStatus: indexStatus ?? health.semanticIndex ?? null,
  };
}

/**
 * Save the periodic semantic-index health-check schedule.
 * @param {string} url - Configured local-server base URL.
 * @param {number} intervalSeconds - Seconds between checks.
 * @param {boolean | undefined} notifyOnNeedsAttention - Whether to notify on failures.
 * @param {string} apiKey - Local-server API key.
 * @returns {Promise<IndexHealthCheck>} Effective server schedule.
 * @throws {Error} When the server rejects the configuration.
 */
export async function configureIndexHealthCheck(
  url: string,
  intervalSeconds: number,
  notifyOnNeedsAttention?: boolean,
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/api/v1/index/health-check`,
    {
      method: "PUT",
      headers: apiHeaders(apiKey),
      body: JSON.stringify({ intervalSeconds, notifyOnNeedsAttention }),
    }
  );
  if (!response.ok)
    throw new Error(
      "TabVault local server could not save the health-check schedule"
    );
  const payload = (await response.json()) as { data: IndexHealthCheck };
  return payload.data;
}

/**
 * Trigger one index health check immediately.
 * @param {string} url - Configured local-server base URL.
 * @param {string} apiKey - Local-server API key.
 * @returns {Promise<IndexHealthCheck>} Latest health-check result.
 * @throws {Error} When the server cannot run the check.
 */
export async function runIndexHealthCheck(
  url: string,
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/api/v1/index/health-check/run`,
    { method: "POST", headers: apiHeaders(apiKey) }
  );
  if (!response.ok)
    throw new Error("TabVault local server could not run the health check");
  const payload = (await response.json()) as { data: IndexHealthCheck };
  return payload.data;
}
