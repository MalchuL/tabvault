import {
  defaultVault,
  isVaultV2,
  orderKey,
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
const VAULT_STORAGE_KEY = "tabvault-v2";
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
  const now = new Date().toISOString();
  const url = tab.url;
  return {
    id: crypto.randomUUID(),
    groupId: null,
    title: tab.title?.trim() || domainFor(url) || "Saved tab",
    url,
    domain: domainFor(url),
    note: "",
    agentReview: "",
    viewed: false,
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

function sessionName(date = new Date()) {
  const month = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][date.getMonth()];
  const pad = value => String(value).padStart(2, "0");
  return `Session ${month} ${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildSessionGroup() {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: sessionName(),
    description: "Captured from the browser",
    category: "session",
    accent: "#829b65",
    createdAt: now,
    updatedAt: now,
  };
}

async function syncQuickCapture(group, tabs) {
  const stored = await chrome.storage.local.get([
    SERVER_URL_KEY,
    API_KEY_STORAGE_KEY,
    STORAGE_MODE_KEY,
  ]);
  if (stored[STORAGE_MODE_KEY] !== "backend") return false;
  const baseUrl = stored[SERVER_URL_KEY] || DEFAULT_SERVER_URL;
  const apiKey = stored[API_KEY_STORAGE_KEY] || "admin";
  const headers = {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
  };
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
  const requests = tabs.map(tab =>
    fetch(`${baseUrl.replace(/\/+$/, "")}/api/v1/tabs`, {
      method: "POST",
      headers: {
        ...headers,
        "Idempotency-Key": tab.id,
      },
      body: JSON.stringify({
        id: tab.id,
        url: tab.url,
        title: tab.title,
        note: tab.note,
        agentReview: tab.agentReview,
        viewed: tab.viewed,
        tags: tab.tags,
        groupId: group.id,
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
  const stored = await chrome.storage.local.get(VAULT_STORAGE_KEY);
  let vault = stored[VAULT_STORAGE_KEY] || defaultVault();
  if (!isVaultV2(vault))
    throw new Error(
      "Browser data is not schema v2; open TabVault to recover it."
    );

  const group = buildSessionGroup();
  let persistedVault = {
    ...vault,
    vaultGroups: [group, ...vault.vaultGroups],
    tabOrders: { ...vault.tabOrders, [orderKey(group.id)]: [] },
  };
  await chrome.storage.local.set({ [VAULT_STORAGE_KEY]: persistedVault });

  const savedTabs = [];
  let closedCount = 0;
  let failedCount = 0;
  for (const sourceTab of validTabs) {
    const nextTab = { ...buildSavedTab(sourceTab), groupId: group.id };
    const nextVault = {
      ...persistedVault,
      tabs: [nextTab, ...persistedVault.tabs],
      tabOrders: {
        ...persistedVault.tabOrders,
        [orderKey(group.id)]: [
          nextTab.id,
          ...(persistedVault.tabOrders[orderKey(group.id)] || []),
        ],
      },
    };
    try {
      await chrome.storage.local.set({ [VAULT_STORAGE_KEY]: nextVault });
      persistedVault = nextVault;
      savedTabs.push(nextTab);
    } catch {
      failedCount += 1;
      continue;
    }
    try {
      await chrome.tabs.remove(sourceTab.id);
      closedCount += 1;
    } catch {
      // The Saved Tab is durable even if Chrome refuses to close its source tab.
    }
  }

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
    failedCount,
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
  let vault = stored[VAULT_STORAGE_KEY] || defaultVault();
  if (!isVaultV2(vault)) throw new Error("Browser library is not schema v2");
  const baseUrl = (stored[SERVER_URL_KEY] || DEFAULT_SERVER_URL).replace(
    /\/+$/,
    ""
  );
  const apiKey = stored[API_KEY_STORAGE_KEY] || "admin";
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
