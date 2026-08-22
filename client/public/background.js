import { canonicalizeTabUrl } from "./url-canonical.js";
import {
  defaultVault,
  serverDocumentToVault,
  vaultToServerDocument,
} from "./library-sync.js";

chrome.runtime.onInstalled.addListener(() => {
  restoreHealthAlarm().catch(() => undefined);
  restoreLibraryRefreshAlarm().catch(() => undefined);
});

const HEALTH_ALERT_KEY = "tabvault-health-alert";
const HEALTH_ALARM_NAME = "tabvault-index-health";
const LIBRARY_REFRESH_KEY = "tabvault-library-refresh";
const LIBRARY_REFRESH_ALARM_NAME = "tabvault-library-refresh";
const VAULT_STORAGE_KEY = "tabvault-v1";
const SERVER_URL_KEY = "tabvault-local-server-url";
const API_KEY_STORAGE_KEY = "tabvault-api-key";
const STORAGE_MODE_KEY = "tabvault-storage-mode";
const SYNC_STATUS_KEY = "tabvault-sync-status";
const DEFAULT_SERVER_URL = "http://127.0.0.1:47821";

function domainFor(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function buildSavedTab(tab) {
  const url = canonicalizeTabUrl(tab.url);
  return {
    id: crypto.randomUUID(),
    groupId: "inbox",
    title: tab.title?.trim() || domainFor(url) || "Saved tab",
    url,
    domain: domainFor(url),
    note: "",
    agentReview: "",
    viewed: false,
    tags: ["quick save"],
    color: "#F05A28",
    icon: "●",
    updated: new Date().toISOString(),
  };
}

async function syncQuickTabs(tabs) {
  const stored = await chrome.storage.local.get([
    SERVER_URL_KEY,
    API_KEY_STORAGE_KEY,
    STORAGE_MODE_KEY,
  ]);
  if (stored[STORAGE_MODE_KEY] !== "backend") return false;
  const baseUrl = stored[SERVER_URL_KEY] || DEFAULT_SERVER_URL;
  const apiKey = stored[API_KEY_STORAGE_KEY] || "admin";
  const requests = tabs.map(tab =>
    fetch(`${baseUrl.replace(/\/+$/, "")}/api/v1/tabs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        tabs: [
          {
            url: tab.url,
            title: tab.title,
            note: tab.note,
            agentReview: tab.agentReview,
            viewed: tab.viewed,
            tags: tab.tags,
            groupId: null,
          },
        ],
      }),
    })
  );
  const results = await Promise.allSettled(requests);
  const serverSynced = results.every(
    result => result.status === "fulfilled" && result.value.ok
  );
  await chrome.storage.local.set({
    [SYNC_STATUS_KEY]: {
      state: serverSynced ? "synced" : "pending",
      localSavedAt: Date.now(),
      ...(serverSynced ? { serverSyncedAt: Date.now() } : {}),
    },
  });
  return serverSynced;
}

async function saveAndCloseTabs(sourceTabs) {
  const validTabs = sourceTabs.filter(
    tab =>
      tab.id && typeof tab.url === "string" && /^https?:\/\//i.test(tab.url)
  );
  const skippedCount = sourceTabs.length - validTabs.length;
  if (!validTabs.length) {
    return { savedCount: 0, closedCount: 0, skippedCount, serverSynced: false };
  }

  const stored = await chrome.storage.local.get(VAULT_STORAGE_KEY);
  const vault = stored[VAULT_STORAGE_KEY] || defaultVault();
  vault.tabs ||= [];
  vault.tabs = vault.tabs.map(tab => ({
    ...tab,
    note: typeof tab.note === "string" ? tab.note : "",
    agentReview: typeof tab.agentReview === "string" ? tab.agentReview : "",
    viewed: Boolean(tab.viewed),
  }));
  vault.tabOrders ||= {};
  vault.tabOrders.inbox ||= [];
  vault.tagCatalog ||= {};
  vault.tagCatalog["quick save"] ||= "Captured from the fast-save popup";

  const savedTabs = [];
  for (const sourceTab of validTabs) {
    const existing = vault.tabs.find(
      tab => canonicalizeTabUrl(tab.url) === canonicalizeTabUrl(sourceTab.url)
    );
    if (existing) {
      if (existing.archived) {
        existing.archived = false;
        existing.archivedAt = null;
        vault.tabOrders[existing.groupId] ||= [];
        vault.tabOrders[existing.groupId] = [
          existing.id,
          ...vault.tabOrders[existing.groupId].filter(id => id !== existing.id),
        ];
      }
      existing.updated = new Date().toISOString();
      savedTabs.push(existing);
      continue;
    }
    const nextTab = buildSavedTab(sourceTab);
    nextTab.archived = false;
    nextTab.archivedAt = null;
    vault.tabs.unshift(nextTab);
    vault.tabOrders.inbox = [
      nextTab.id,
      ...vault.tabOrders.inbox.filter(id => id !== nextTab.id),
    ];
    savedTabs.push(nextTab);
  }

  await chrome.storage.local.set({ [VAULT_STORAGE_KEY]: vault });
  const serverSynced = await syncQuickTabs(savedTabs).catch(() => false);
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
  const closeIds = validTabs.map(tab => tab.id).filter(Boolean);
  let closedCount = 0;
  try {
    await chrome.tabs.remove(closeIds);
    closedCount = closeIds.length;
  } catch {
    // The local library write still succeeded; Chrome may reject closing the final tab or a tab that changed state.
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
    serverSynced,
  };
}

async function fetchReadablePage(url) {
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

async function openVaultTabs(urls) {
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

async function restoreHealthAlarm() {
  const stored = await chrome.storage.local.get(HEALTH_ALERT_KEY);
  const settings = stored[HEALTH_ALERT_KEY];
  if (
    !settings?.enabled ||
    !settings?.notifyOnNeedsAttention ||
    !settings?.intervalMinutes
  ) {
    await chrome.alarms.clear(HEALTH_ALARM_NAME);
    return;
  }
  chrome.alarms.create(HEALTH_ALARM_NAME, {
    periodInMinutes: Math.max(1, settings.intervalMinutes),
  });
}

async function restoreLibraryRefreshAlarm() {
  const stored = await chrome.storage.local.get(LIBRARY_REFRESH_KEY);
  const intervalSeconds = Number(stored[LIBRARY_REFRESH_KEY]?.intervalSeconds);
  if (!Number.isFinite(intervalSeconds) || intervalSeconds < 60) {
    await chrome.alarms.clear(LIBRARY_REFRESH_ALARM_NAME);
    return;
  }
  chrome.alarms.create(LIBRARY_REFRESH_ALARM_NAME, {
    periodInMinutes: Math.max(1, Math.round(intervalSeconds / 60)),
  });
}

async function refreshStoredLibrary() {
  const stored = await chrome.storage.local.get([
    VAULT_STORAGE_KEY,
    SERVER_URL_KEY,
    API_KEY_STORAGE_KEY,
    STORAGE_MODE_KEY,
  ]);
  if (stored[STORAGE_MODE_KEY] !== "backend") return false;
  const vault = stored[VAULT_STORAGE_KEY] || defaultVault();
  const baseUrl = (stored[SERVER_URL_KEY] || DEFAULT_SERVER_URL).replace(
    /\/+$/,
    ""
  );
  const apiKey = stored[API_KEY_STORAGE_KEY] || "admin";
  const response = await fetch(`${baseUrl}/api/v1/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
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
  const exportResponse = await fetch(`${baseUrl}/api/v1/export?format=json`, {
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
    chrome.storage.local
      .set({ [HEALTH_ALERT_KEY]: message.settings })
      .then(restoreHealthAlarm)
      .catch(() => undefined);
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
  if (alarm.name !== HEALTH_ALARM_NAME) return;
  const stored = await chrome.storage.local.get(HEALTH_ALERT_KEY);
  const settings = stored[HEALTH_ALERT_KEY];
  if (
    !settings?.enabled ||
    !settings?.notifyOnNeedsAttention ||
    !settings?.serverUrl
  )
    return;
  try {
    const response = await fetch(
      `${settings.serverUrl.replace(/\/+$/, "")}/api/v1/index/health-check/run`,
      {
        method: "POST",
        headers: { "X-API-Key": settings.apiKey || "admin" },
      }
    );
    const payload = await response.json();
    const result = payload.data || payload;
    if (result.lastResult === "needs_attention") {
      chrome.notifications.create("tabvault-index-attention", {
        type: "basic",
        iconUrl: "icon-128.png",
        title: "TabVault index needs attention",
        message:
          "Your local semantic index is unavailable or needs a rebuild. Open TabVault to review it.",
      });
    }
  } catch {
    // The server is local and may be intentionally stopped; an alert should not be created for a missing local process.
  }
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
