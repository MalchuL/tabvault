/**
 * Signal Library implementation reminder: this adapter makes the UI local-first.
 * Chrome extension storage is the durable foundation until the local server is introduced.
 */

import {
  emptyBrowserVault,
  fromServerDocument,
  toServerDocument,
  type PersistedVault,
} from "./library";

export type ChromeTabSnapshot = {
  id?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
};

type ChromeStorageArea = {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (value: Record<string, unknown>) => Promise<void>;
};

type ChromeRuntime = {
  id?: string;
  onMessage: {
    addListener: (listener: (message: unknown) => void) => void;
    removeListener: (listener: (message: unknown) => void) => void;
  };
  sendMessage: <T = unknown>(message: unknown) => Promise<T>;
};

type ChromeApi = {
  storage?: { local?: ChromeStorageArea };
  tabs?: {
    query: (queryInfo: {
      active: boolean;
      currentWindow: boolean;
    }) => Promise<ChromeTabSnapshot[]>;
    create: (createProperties: {
      url: string;
      active?: boolean;
    }) => Promise<unknown>;
  };
  runtime?: ChromeRuntime;
};

declare global {
  interface Window {
    chrome?: ChromeApi;
  }
}

export const TABVAULT_STORAGE_KEY = "tabvault-v1";
export const TABVAULT_SERVER_URL_KEY = "tabvault-local-server-url";
export const TABVAULT_API_KEY_KEY = "tabvault-api-key";
export const TABVAULT_SYNC_STATUS_KEY = "tabvault-sync-status";
export const TABVAULT_STORAGE_MODE_KEY = "tabvault-storage-mode";
export const TABVAULT_LIBRARY_REFRESH_INTERVAL_KEY =
  "tabvault-library-refresh-interval";
export const DEFAULT_TABVAULT_SERVER_URL = "http://127.0.0.1:47821";
export const DEFAULT_TABVAULT_API_KEY = "admin";

export type SyncStatus = {
  state: "local_only" | "synced" | "pending";
  localSavedAt: number;
  serverSyncedAt?: number;
};

export type StorageMode = "local" | "backend";

type OpenTabsResponse = {
  openedCount: number;
  requestedCount: number;
};

export type LocalServerTab = {
  id: string;
  url: string;
  title: string;
  note?: string | null;
  tags: string[];
  groupId?: string | null;
  position?: number;
  updatedAt?: string;
};

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

export type IndexHealthCheck = {
  enabled: boolean;
  intervalSeconds: number;
  lastCheck?: string | null;
  lastResult?: "ready" | "needs_attention" | null;
  notifyOnNeedsAttention?: boolean;
  lastAlert?: string | null;
};

export function isExtensionContext() {
  return Boolean(window.chrome?.runtime?.id && window.chrome?.storage?.local);
}

export type ReadablePageSource = {
  html: string;
  url: string;
};

type ReadablePageResponse = Partial<ReadablePageSource> & { error?: string };

export async function fetchReadablePageSource(
  url: string
): Promise<ReadablePageSource> {
  if (!/^https?:\/\//i.test(url))
    throw new Error("Only HTTP(S) pages can be rendered as readable previews.");

  if (isExtensionContext() && window.chrome?.runtime?.sendMessage) {
    const result =
      await window.chrome.runtime.sendMessage<ReadablePageResponse>({
        type: "TABVAULT_FETCH_READABLE_PAGE",
        url,
      });
    if (result.html && result.url)
      return { html: result.html, url: result.url };
    throw new Error(
      result.error ?? "The extension could not retrieve this page."
    );
  }

  const response = await fetch(url, {
    credentials: "omit",
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  if (!response.ok)
    throw new Error(`The page responded with ${response.status}.`);
  const html = await response.text();
  if (!html.trim()) throw new Error("The page did not return readable HTML.");
  return { html, url: response.url || url };
}

export async function openTabUrls(urls: string[]): Promise<OpenTabsResponse> {
  const validUrls = Array.from(
    new Set(urls.filter(url => /^https?:\/\//i.test(url)))
  );
  if (isExtensionContext() && window.chrome?.tabs?.create) {
    let openedCount = 0;
    for (const url of validUrls) {
      try {
        await window.chrome.tabs.create({ url, active: false });
        openedCount += 1;
      } catch {
        // Continue opening the remainder and report the completed count.
      }
    }
    return { openedCount, requestedCount: validUrls.length };
  }
  if (isExtensionContext() && window.chrome?.runtime?.sendMessage) {
    return window.chrome.runtime.sendMessage<OpenTabsResponse>({
      type: "TABVAULT_OPEN_TABS",
      urls: validUrls,
    });
  }
  // Activate anchors synchronously inside the original click gesture. This is
  // more consistently treated as navigation than repeated popup calls by
  // hosted-browser popup blockers, while the extension path above retains
  // authoritative chrome.tabs.create counts.
  let openedCount = 0;
  for (const url of validUrls) {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (opened) openedCount += 1;
  }
  return { openedCount, requestedCount: validUrls.length };
}

export async function readExtensionVault<T>() {
  const stored = await window.chrome?.storage?.local?.get(TABVAULT_STORAGE_KEY);
  if (stored?.[TABVAULT_STORAGE_KEY]) return stored[TABVAULT_STORAGE_KEY] as T;
  try {
    return JSON.parse(
      window.localStorage.getItem(TABVAULT_STORAGE_KEY) ?? "null"
    ) as T | undefined;
  } catch {
    return undefined;
  }
}

export async function writeExtensionVault<T>(vault: T) {
  if (window.chrome?.storage?.local)
    await window.chrome.storage.local.set({ [TABVAULT_STORAGE_KEY]: vault });
  else window.localStorage.setItem(TABVAULT_STORAGE_KEY, JSON.stringify(vault));
}

export async function readSyncStatus() {
  const stored = await window.chrome?.storage?.local?.get(
    TABVAULT_SYNC_STATUS_KEY
  );
  const saved =
    stored?.[TABVAULT_SYNC_STATUS_KEY] ??
    window.localStorage.getItem(TABVAULT_SYNC_STATUS_KEY);
  if (typeof saved === "string") {
    try {
      return JSON.parse(saved) as SyncStatus;
    } catch {
      return undefined;
    }
  }
  if (saved && typeof saved === "object") return saved as SyncStatus;
  return undefined;
}

export async function writeSyncStatus(status: SyncStatus) {
  if (window.chrome?.storage?.local) {
    await window.chrome.storage.local.set({
      [TABVAULT_SYNC_STATUS_KEY]: status,
    });
  } else {
    window.localStorage.setItem(
      TABVAULT_SYNC_STATUS_KEY,
      JSON.stringify(status)
    );
  }
}

export async function readStorageMode(): Promise<StorageMode> {
  const stored = await window.chrome?.storage?.local?.get(
    TABVAULT_STORAGE_MODE_KEY
  );
  const configured =
    stored?.[TABVAULT_STORAGE_MODE_KEY] ??
    window.localStorage.getItem(TABVAULT_STORAGE_MODE_KEY);
  return configured === "backend" ? "backend" : "local";
}

export async function writeStorageMode(mode: StorageMode) {
  if (window.chrome?.storage?.local) {
    await window.chrome.storage.local.set({
      [TABVAULT_STORAGE_MODE_KEY]: mode,
    });
  } else {
    window.localStorage.setItem(TABVAULT_STORAGE_MODE_KEY, mode);
  }
}

export async function readLocalServerUrl() {
  const stored = await window.chrome?.storage?.local?.get(
    TABVAULT_SERVER_URL_KEY
  );
  const configured =
    stored?.[TABVAULT_SERVER_URL_KEY] ??
    window.localStorage.getItem(TABVAULT_SERVER_URL_KEY);
  return typeof configured === "string" && configured.trim()
    ? configured.replace(/\/+$/, "")
    : DEFAULT_TABVAULT_SERVER_URL;
}

export async function writeLocalServerUrl(url: string) {
  const value = url.replace(/\/+$/, "");
  if (window.chrome?.storage?.local)
    await window.chrome.storage.local.set({ [TABVAULT_SERVER_URL_KEY]: value });
  else window.localStorage.setItem(TABVAULT_SERVER_URL_KEY, value);
}

export async function readApiKey() {
  const stored = await window.chrome?.storage?.local?.get(TABVAULT_API_KEY_KEY);
  const configured =
    stored?.[TABVAULT_API_KEY_KEY] ??
    window.localStorage.getItem(TABVAULT_API_KEY_KEY);
  return typeof configured === "string" && configured.trim()
    ? configured
    : DEFAULT_TABVAULT_API_KEY;
}

export async function writeApiKey(key: string) {
  const value = key || DEFAULT_TABVAULT_API_KEY;
  if (window.chrome?.storage?.local)
    await window.chrome.storage.local.set({ [TABVAULT_API_KEY_KEY]: value });
  else window.localStorage.setItem(TABVAULT_API_KEY_KEY, value);
}

export async function readLibraryRefreshInterval(): Promise<number> {
  const stored = await window.chrome?.storage?.local?.get(
    TABVAULT_LIBRARY_REFRESH_INTERVAL_KEY
  );
  const configured =
    stored?.[TABVAULT_LIBRARY_REFRESH_INTERVAL_KEY] ??
    window.localStorage.getItem(TABVAULT_LIBRARY_REFRESH_INTERVAL_KEY);
  const seconds = Number(configured);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

export async function writeLibraryRefreshInterval(seconds: number) {
  const value = Math.max(0, Math.round(seconds));
  if (window.chrome?.storage?.local) {
    await window.chrome.storage.local.set({
      [TABVAULT_LIBRARY_REFRESH_INTERVAL_KEY]: value,
    });
  } else {
    window.localStorage.setItem(
      TABVAULT_LIBRARY_REFRESH_INTERVAL_KEY,
      String(value)
    );
  }
}

export async function configureExtensionLibraryRefresh(
  intervalSeconds: number
) {
  await window.chrome?.runtime?.sendMessage({
    type: "TABVAULT_CONFIGURE_LIBRARY_REFRESH",
    intervalSeconds,
  });
}

function apiHeaders(
  apiKey = DEFAULT_TABVAULT_API_KEY,
  extra: Record<string, string> = {}
) {
  return {
    "content-type": "application/json",
    "X-API-Key": apiKey,
    ...extra,
  };
}

export async function checkLocalServer(
  url: string,
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  const response = await fetch(`${url.replace(/\/+$/, "")}/api/v1/health`, {
    headers: apiHeaders(apiKey),
  });
  if (!response.ok)
    throw new Error("Local server did not return a healthy status");
  return response.json() as Promise<{
    status: string;
    schemaVersion: number;
    semanticIndex?: SemanticIndexStatus;
  }>;
}

export async function readLibraryFromServer(
  url: string,
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/api/v1/export?format=json`,
    {
      headers: apiHeaders(apiKey),
    }
  );
  if (!response.ok)
    throw new Error("TabVault API could not read the shared library");
  return response.json() as Promise<Record<string, unknown>>;
}

export async function mergeLibraryToServer(
  url: string,
  document: Record<string, unknown>,
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  const response = await fetch(`${url.replace(/\/+$/, "")}/api/v1/import`, {
    method: "POST",
    headers: apiHeaders(apiKey),
    body: JSON.stringify({ mode: "upload", format: "json", content: document }),
  });
  if (!response.ok)
    throw new Error("TabVault API could not sync the shared library");
  return response.json() as Promise<{
    success: boolean;
    data?: Record<string, unknown>;
    warnings?: Array<{ code?: string; message?: string }>;
  }>;
}

export async function refreshLibraryFromServer(
  url: string,
  apiKey: string,
  localVault: PersistedVault
) {
  const result = await mergeLibraryToServer(
    url,
    toServerDocument(localVault),
    apiKey
  );
  if (!result.success)
    throw new Error("TabVault API could not merge the shared library");
  const document = await readLibraryFromServer(url, apiKey);
  return {
    vault: fromServerDocument(document, localVault),
    warnings: result.warnings ?? [],
  };
}

export async function clearLibraryOnServer(
  url: string,
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  const response = await fetch(`${url.replace(/\/+$/, "")}/api/v1/library`, {
    method: "DELETE",
    headers: apiHeaders(apiKey),
  });
  if (!response.ok)
    throw new Error("TabVault API could not clear the shared library");
  return response.json() as Promise<{
    success: boolean;
    cleared: boolean;
    backup?: string | null;
  }>;
}

export async function clearBrowserLibrary() {
  await writeExtensionVault(emptyBrowserVault());
  await writeSyncStatus({
    state: "local_only",
    localSavedAt: Date.now(),
  });
}

export async function saveTabToLocalServer(
  url: string,
  tab: {
    url: string;
    title: string;
    note: string;
    tags: string[];
    groupId: string | null;
    favicon?: string | null;
  },
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  const response = await fetch(`${url.replace(/\/+$/, "")}/api/v1/tabs`, {
    method: "POST",
    headers: apiHeaders(apiKey),
    body: JSON.stringify({ tabs: [tab] }),
  });
  if (!response.ok) throw new Error("TabVault local server rejected the tab");
  return response.json() as Promise<{
    success: boolean;
    data: { created: Array<{ wasDuplicate?: boolean }> };
  }>;
}

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
  };
  return {
    mode: "semantic" as const,
    query,
    group: group ?? null,
    results: payload.data.results,
  };
}

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
  const payload = (await response.json()) as { data: SemanticIndexStatus };
  return payload.data;
}

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
  return getSemanticIndexStatus(url, apiKey);
}

export async function updateTabOnLocalServer(
  url: string,
  id: string,
  updates: Record<string, unknown>,
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/api/v1/tabs/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: apiHeaders(apiKey),
      body: JSON.stringify(updates),
    }
  );
  if (!response.ok)
    throw new Error("TabVault local server could not update the tab");
  return response.json();
}

export async function deleteTabOnLocalServer(
  url: string,
  id: string,
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/api/v1/tabs/${encodeURIComponent(id)}`,
    { method: "DELETE", headers: apiHeaders(apiKey) }
  );
  if (!response.ok)
    throw new Error("TabVault local server could not remove the tab");
  return response.json();
}

export async function restoreTabsOnLocalServer(
  url: string,
  tabs: LocalServerTab[],
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/api/v1/tabs/restore`,
    {
      method: "POST",
      headers: apiHeaders(apiKey),
      body: JSON.stringify(tabs),
    }
  );
  if (!response.ok)
    throw new Error(
      "TabVault local server could not restore the undo snapshot"
    );
  return response.json() as Promise<{ restored: number }>;
}

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

export async function configureExtensionHealthAlerts(
  serverUrl: string,
  healthCheck: IndexHealthCheck,
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  await window.chrome?.runtime?.sendMessage({
    type: "TABVAULT_CONFIGURE_HEALTH_ALERTS",
    settings: {
      enabled: healthCheck.enabled,
      notifyOnNeedsAttention: Boolean(healthCheck.notifyOnNeedsAttention),
      intervalMinutes: Math.max(
        1,
        Math.round(healthCheck.intervalSeconds / 60)
      ),
      serverUrl,
      apiKey,
    },
  });
}

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

export async function getActiveChromeTab() {
  const result = await window.chrome?.tabs?.query({
    active: true,
    currentWindow: true,
  });
  return result?.[0];
}

export function addExtensionMessageListener(
  listener: (message: unknown) => void
) {
  window.chrome?.runtime?.onMessage.addListener(listener);
  return () => window.chrome?.runtime?.onMessage.removeListener(listener);
}
