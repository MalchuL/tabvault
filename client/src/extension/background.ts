import {
  configureHealthAlerts,
  HEALTH_ALARM_NAME,
  restoreHealthAlarm,
  runIndexHealthAlert,
} from "./healthAlerts";
import {
  defaultVault,
  isPersistedVault,
  orderKey,
  serverDocumentToVault,
  upgradeVault,
  vaultToServerDocument,
} from "./library-sync";
import type { VaultGroup, VaultTab } from "@/domain/library/types";
import { createSessionGroup } from "@/domain/library/session";
import { domainFromUrl } from "@/domain/library/codec";
import { ensureViewedProperty } from "@/domain/server/propertySchema";

type CapturableTab = chrome.tabs.Tab & { id: number; url: string };
chrome.runtime.onInstalled.addListener(() => {
  restoreHealthAlarm().catch(() => undefined);
  restoreLibraryRefreshAlarm().catch(() => undefined);
});

const LIBRARY_REFRESH_KEY = "tabvault-library-refresh";
const LIBRARY_REFRESH_ALARM_NAME = "tabvault-library-refresh";
const VAULT_STORAGE_KEY = "tabvault-v3";
const PREVIOUS_VAULT_STORAGE_KEY = "tabvault-v2";
const SERVER_URL_KEY = "tabvault-local-server-url";
const API_KEY_STORAGE_KEY = "tabvault-api-key";
const STORAGE_MODE_KEY = "tabvault-storage-mode";
const SYNC_STATUS_KEY = "tabvault-sync-status";
const DEFAULT_SERVER_URL = "http://127.0.0.1:47821";

/**
 * Turn a capturable browser tab into a new local saved-tab record.
 * The browser title falls back to its domain; capture starts unviewed and active.
 * @param {CapturableTab} tab - HTTP(S) tab with an ID and URL.
 * @returns {VaultTab} New saved tab with a stable ID and timestamps.
 */
function buildSavedTab(tab: CapturableTab): VaultTab {
  const now = new Date().toISOString();
  const url = tab.url;
  const domain = domainFromUrl(url);
  return {
    id: crypto.randomUUID(),
    groupId: null,
    title: tab.title?.trim() || domain || "Saved tab",
    url,
    domain,
    note: "",
    agentReview: "",
    viewed: false,
    customProperties: { viewed: false },
    tags: [],
    color: "#F05A28",
    icon: "●",
    createdAt: now,
    updatedAt: now,
    archived: false,
    archivedAt: null,
    hiddenUntil: null,
  };
}

/**
 * Mirror a locally saved session to the server when backend mode is enabled.
 * A group ID doubles as the batch idempotency key so retries do not duplicate
 * tabs. A failed server attempt leaves the browser copy available for retry.
 * @param {VaultGroup} group - Session group already stored locally.
 * @param {VaultTab[]} tabs - Captured members assigned to that group.
 * @returns {Promise<boolean>} Whether the server accepted the session.
 */
async function syncQuickCapture(group: VaultGroup, tabs: VaultTab[]) {
  const stored = await chrome.storage.local.get([
    SERVER_URL_KEY,
    API_KEY_STORAGE_KEY,
    STORAGE_MODE_KEY,
  ]);
  if (stored[STORAGE_MODE_KEY] !== "backend") return false;
  const baseUrl = String(stored[SERVER_URL_KEY] || DEFAULT_SERVER_URL);
  const apiKey = String(stored[API_KEY_STORAGE_KEY] || "admin");
  const headers = {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
  };
  try {
    await ensureViewedProperty(baseUrl, apiKey);
  } catch {
    return false;
  }
  const groupResponse = await fetch(
    `${baseUrl.replace(/\/+$/, "")}/api/v1/groups`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: group.id,
        name: group.name,
        category: group.category,
        description: group.description,
        color: group.accent,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
      }),
    }
  );
  if (!groupResponse.ok) return false;
  if (!tabs.length) return true;
  const tabsResponse = await fetch(
    `${baseUrl.replace(/\/+$/, "")}/api/v1/tabs/batch`,
    {
      method: "POST",
      headers: {
        ...headers,
        "Idempotency-Key": group.id,
      },
      body: JSON.stringify({
        tabs: tabs.map(tab => ({
          id: tab.id,
          url: tab.url,
          title: tab.title,
          note: tab.note,
          agentReview: tab.agentReview,
          customProperties: { ...tab.customProperties, viewed: tab.viewed },
          tags: tab.tags,
          groupId: group.id,
        })),
      }),
    }
  );
  const serverSynced = tabsResponse.ok;
  await chrome.storage.local.set({
    [SYNC_STATUS_KEY]: {
      state: serverSynced ? "synced" : "pending",
      localSavedAt: Date.now(),
      ...(serverSynced ? { serverSyncedAt: Date.now() } : {}),
    },
  });
  return serverSynced;
}

/**
 * Save supported tabs locally before asking Chrome to close them.
 * Unsupported internal tabs remain open, and local storage is the recovery
 * copy if the optional server sync fails.
 * @param {chrome.tabs.Tab[]} sourceTabs - Popup-selected browser tabs.
 * @returns {Promise<{ savedCount: number; closedCount: number; skippedCount: number; failedCount: number; serverSynced: boolean }>} Capture and close counts.
 * @throws {Error} When stored browser data is incompatible with schema v3.
 */
async function saveAndCloseTabs(sourceTabs: chrome.tabs.Tab[]) {
  const validTabs = sourceTabs.filter(
    tab =>
      tab.id && typeof tab.url === "string" && /^https?:\/\//i.test(tab.url)
  ) as CapturableTab[];
  const skippedCount = sourceTabs.length - validTabs.length;
  const stored = await chrome.storage.local.get([
    VAULT_STORAGE_KEY,
    PREVIOUS_VAULT_STORAGE_KEY,
  ]);
  const vault =
    upgradeVault(
      stored[VAULT_STORAGE_KEY] ?? stored[PREVIOUS_VAULT_STORAGE_KEY]
    ) ?? defaultVault();
  if (!isPersistedVault(vault))
    throw new Error(
      "Browser data is not schema v3; open TabVault to recover it."
    );

  const group = createSessionGroup();
  const savedTabs = validTabs.map(sourceTab => ({
    ...buildSavedTab(sourceTab),
    groupId: group.id,
  }));
  const persistedVault = {
    ...vault,
    vaultGroups: [group, ...vault.vaultGroups],
    tabs: [...savedTabs, ...vault.tabs],
    tabOrders: {
      ...vault.tabOrders,
      [orderKey(group.id)]: savedTabs.map(tab => tab.id),
    },
  };
  // Persist before closing source tabs so a failed close or server sync cannot lose them.
  await chrome.storage.local.set({ [VAULT_STORAGE_KEY]: persistedVault });

  const closeResults = await Promise.allSettled(
    validTabs.map(sourceTab => chrome.tabs.remove(sourceTab.id))
  );
  const closedCount = closeResults.filter(
    result => result.status === "fulfilled"
  ).length;

  const serverSynced = await syncQuickCapture(group, savedTabs).catch(
    () => false
  );
  if (!serverSynced) {
    const storageMode = await chrome.storage.local.get(STORAGE_MODE_KEY);
    await chrome.storage.local.set({
      [SYNC_STATUS_KEY]: {
        state:
          storageMode[STORAGE_MODE_KEY] === "backend"
            ? "pending"
            : "local_only",
        localSavedAt: Date.now(),
      },
    });
  }
  chrome.runtime
    .sendMessage({
      type: "TABVAULT_LIBRARY_UPDATED",
      savedCount: savedTabs.length,
    })
    .catch(() => undefined);

  return {
    savedCount: savedTabs.length,
    closedCount,
    skippedCount,
    failedCount: 0,
    serverSynced,
  };
}

/**
 * Fetch limited HTML for the reader without changing the saved tab.
 * Rejects non-HTTP URLs and aborts after twelve seconds; response content is
 * capped before crossing the extension messaging boundary.
 * @param {string} url - Page URL requested by the reader.
 * @returns {Promise<{ html: string; url: string }>} Bounded HTML and final URL.
 * @throws {Error} When the URL, response, or content is unusable.
 */
async function fetchReadablePage(url: string) {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url))
    throw new Error("Only HTTP(S) pages can be fetched for reading preview.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    if (!response.ok)
      throw new Error(`The page responded with ${response.status}.`);
    const html = await response.text();
    if (!html.trim()) throw new Error("The page did not return readable HTML.");
    return {
      html: html.slice(0, 2_000_000),
      url: response.url || url,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Open distinct HTTP(S) vault URLs as background tabs.
 * A failed tab creation does not prevent later URLs from opening.
 * @param {string[]} urls - Requested saved URLs, possibly duplicated.
 * @returns {Promise<{ openedCount: number; requestedCount: number; openedUrls: string[] }>} Attempted and completed openings.
 */
async function openVaultTabs(urls: string[]) {
  const validUrls = [...new Set(urls || [])].filter(url =>
    /^https?:\/\//i.test(url)
  );
  let openedCount = 0;
  const openedUrls = [];
  for (const url of validUrls) {
    try {
      await chrome.tabs.create({ url, active: false });
      openedCount += 1;
      openedUrls.push(url);
    } catch {
      // Continue opening the remainder and return an accurate completed count.
    }
  }
  return {
    openedCount,
    requestedCount: validUrls.length,
    openedUrls,
  };
}

/**
 * Recreate or clear the library refresh alarm from its stored interval.
 * Intervals below one minute disable the alarm.
 * @returns {Promise<void>} Resolves after the alarm state is updated.
 */
async function restoreLibraryRefreshAlarm() {
  const stored = await chrome.storage.local.get(LIBRARY_REFRESH_KEY);
  const intervalSeconds = Number(
    (stored[LIBRARY_REFRESH_KEY] as { intervalSeconds?: number } | undefined)
      ?.intervalSeconds
  );
  if (!Number.isFinite(intervalSeconds) || intervalSeconds < 60) {
    await chrome.alarms.clear(LIBRARY_REFRESH_ALARM_NAME);
    return;
  }
  chrome.alarms.create(LIBRARY_REFRESH_ALARM_NAME, {
    periodInMinutes: Math.max(1, Math.round(intervalSeconds / 60)),
  });
}

/**
 * Refresh the browser vault through the backend only in server storage mode.
 * Replays pending tombstones before upload and retains unresolved deletions
 * locally so the next refresh can retry them.
 * @returns {Promise<boolean>} Whether a backend refresh was attempted and completed.
 * @throws {Error} When stored data is incompatible or server import fails.
 */
async function refreshStoredLibrary() {
  const stored = await chrome.storage.local.get([
    VAULT_STORAGE_KEY,
    PREVIOUS_VAULT_STORAGE_KEY,
    SERVER_URL_KEY,
    API_KEY_STORAGE_KEY,
    STORAGE_MODE_KEY,
  ]);
  if (stored[STORAGE_MODE_KEY] !== "backend") return false;
  let vault =
    upgradeVault(
      stored[VAULT_STORAGE_KEY] ?? stored[PREVIOUS_VAULT_STORAGE_KEY]
    ) ?? defaultVault();
  if (!isPersistedVault(vault))
    throw new Error("Browser library is not schema v3");
  const baseUrl = String(stored[SERVER_URL_KEY] || DEFAULT_SERVER_URL).replace(
    /\/+$/,
    ""
  );
  const apiKey = String(stored[API_KEY_STORAGE_KEY] || "admin");
  const headers = {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
  };
  const remainingGroups = [];
  for (const id of vault.tombstones?.groups ?? []) {
    const response = await fetch(
      `${baseUrl}/api/v1/groups/${encodeURIComponent(id)}`,
      { method: "DELETE", headers }
    );
    if (!response.ok && response.status !== 404) remainingGroups.push(id);
  }
  const remainingTabs = [];
  for (const id of vault.tombstones?.tabs ?? []) {
    const response = await fetch(
      `${baseUrl}/api/v1/tabs/${encodeURIComponent(id)}?hard=true`,
      { method: "DELETE", headers }
    );
    if (!response.ok && response.status !== 404) remainingTabs.push(id);
  }
  vault = {
    ...vault,
    tombstones: { tabs: remainingTabs, groups: remainingGroups },
  };
  await chrome.storage.local.set({ [VAULT_STORAGE_KEY]: vault });
  const response = await fetch(`${baseUrl}/api/v1/import`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      mode: "upload",
      format: "json",
      content: vaultToServerDocument(vault),
    }),
  });
  if (!response.ok)
    throw new Error(`Library refresh returned ${response.status}`);
  const payload = await response.json();
  if (!payload?.success) throw new Error("Library refresh import failed");
  const exportResponse = await fetch(`${baseUrl}/api/v1/sync`, {
    headers: { "X-API-Key": apiKey },
  });
  if (!exportResponse.ok)
    throw new Error(`Library export returned ${exportResponse.status}`);
  const mergedVault = serverDocumentToVault(await exportResponse.json(), vault);
  await chrome.storage.local.set({
    [VAULT_STORAGE_KEY]: mergedVault,
    [SYNC_STATUS_KEY]: {
      state: "synced",
      localSavedAt: Date.now(),
      serverSyncedAt: Date.now(),
    },
  });
  chrome.runtime
    .sendMessage({ type: "TABVAULT_LIBRARY_REFRESHED" })
    .catch(() => undefined);
  return true;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "TABVAULT_CONFIGURE_HEALTH_ALERTS") {
    void configureHealthAlerts(message.settings).catch(() => undefined);
    return;
  }
  if (message?.type === "TABVAULT_CONFIGURE_LIBRARY_REFRESH") {
    chrome.storage.local
      .set({
        [LIBRARY_REFRESH_KEY]: {
          intervalSeconds: Number(message.intervalSeconds) || 0,
        },
      })
      .then(restoreLibraryRefreshAlarm)
      .catch(() => undefined);
    return;
  }
  if (message?.type === "TABVAULT_REFRESH_LIBRARY") {
    void refreshStoredLibrary()
      .then(synced => sendResponse({ success: true, synced }))
      .catch(error =>
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        })
      );
    return true;
  }
  if (message?.type === "TABVAULT_FAST_SAVE_AND_CLOSE") {
    void saveAndCloseTabs(message.tabs || [])
      .then(sendResponse)
      .catch(error => sendResponse({ error: String(error) }));
    return true;
  }
  if (message?.type === "TABVAULT_FETCH_READABLE_PAGE") {
    void fetchReadablePage(message.url)
      .then(sendResponse)
      .catch(error =>
        sendResponse({
          error:
            error instanceof Error
              ? error.message
              : "The extension could not retrieve this page.",
        })
      );
    return true;
  }
  if (message?.type === "TABVAULT_OPEN_TABS") {
    void openVaultTabs(message.urls)
      .then(sendResponse)
      .catch(error =>
        sendResponse({
          openedCount: 0,
          requestedCount: Array.isArray(message.urls) ? message.urls.length : 0,
          openedUrls: [],
          error: String(error),
        })
      );
    return true;
  }
});

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === LIBRARY_REFRESH_ALARM_NAME) {
    await refreshStoredLibrary().catch(() => undefined);
    return;
  }
  if (alarm.name === HEALTH_ALARM_NAME) await runIndexHealthAlert();
});

chrome.commands.onCommand.addListener(async command => {
  if (command !== "save-current-tab") return;

  const [activeTab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (!activeTab?.id || !activeTab.windowId) return;

  await chrome.sidePanel
    .open({ windowId: activeTab.windowId })
    .catch(() => undefined);
  chrome.runtime
    .sendMessage({ type: "TABVAULT_CAPTURE_ACTIVE", tab: activeTab })
    .catch(() => undefined);
});

restoreHealthAlarm().catch(() => undefined);
restoreLibraryRefreshAlarm().catch(() => undefined);
