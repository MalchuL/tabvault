chrome.runtime.onInstalled.addListener(() => {
  restoreHealthAlarm().catch(() => undefined);
});

const HEALTH_ALERT_KEY = "tabvault-health-alert";
const HEALTH_ALARM_NAME = "tabvault-index-health";
const VAULT_STORAGE_KEY = "tabvault-v1";
const SERVER_URL_KEY = "tabvault-local-server-url";
const API_KEY_STORAGE_KEY = "tabvault-api-key";

function defaultVault() {
  return {
    tabs: [],
    vaultGroups: [
      { id: "inbox", name: "Inbox", accent: "#F05A28" },
      { id: "research", name: "Research", accent: "#829b65" },
      {
        id: "llm-papers",
        name: "LLM papers",
        parent: "research",
        accent: "#7aa6a1",
      },
      { id: "build", name: "Build", accent: "#7c8bba" },
      { id: "filed", name: "Filed", accent: "#bb9b68" },
    ],
    tagCatalog: { "quick save": "Captured from the fast-save popup" },
    tabOrders: { inbox: [] },
    savedSearches: [],
    tabView: "standard",
  };
}

function normaliseUrl(value) {
  try {
    const url = new URL(value);
    const query = [...url.searchParams.entries()].sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    url.hash = "";
    url.search = new URLSearchParams(query).toString();
    return url.toString();
  } catch {
    return value;
  }
}

function domainFor(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function buildSavedTab(tab) {
  const url = normaliseUrl(tab.url);
  return {
    id: crypto.randomUUID(),
    groupId: "inbox",
    title: tab.title?.trim() || domainFor(url) || "Saved tab",
    url,
    domain: domainFor(url),
    note: "Captured with TabVault fast save. Add a note or move it when ready.",
    tags: ["quick save"],
    color: "#F05A28",
    icon: "●",
    updated: "now",
  };
}

async function syncQuickTabs(tabs) {
  const stored = await chrome.storage.local.get([
    SERVER_URL_KEY,
    API_KEY_STORAGE_KEY,
  ]);
  const baseUrl = stored[SERVER_URL_KEY];
  if (!baseUrl) return false;
  const apiKey = stored[API_KEY_STORAGE_KEY] || "admin";
  const requests = tabs.map(tab =>
    fetch(`${baseUrl.replace(/\/+$/, "")}/v1/tabs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: tab.url,
        title: tab.title,
        note: tab.note,
        tags: tab.tags,
        groupId: null,
      }),
    })
  );
  const results = await Promise.allSettled(requests);
  return results.every(
    result => result.status === "fulfilled" && result.value.ok
  );
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
  vault.tabOrders ||= {};
  vault.tabOrders.inbox ||= [];
  vault.tagCatalog ||= {};
  vault.tagCatalog["quick save"] ||= "Captured from the fast-save popup";

  const savedTabs = [];
  for (const sourceTab of validTabs) {
    const existing = vault.tabs.find(
      tab => normaliseUrl(tab.url) === normaliseUrl(sourceTab.url)
    );
    if (existing) {
      existing.tags = [...new Set([...(existing.tags || []), "quick save"])];
      existing.updated = "now";
      savedTabs.push(existing);
      continue;
    }
    const nextTab = buildSavedTab(sourceTab);
    vault.tabs.unshift(nextTab);
    vault.tabOrders.inbox = [
      nextTab.id,
      ...vault.tabOrders.inbox.filter(id => id !== nextTab.id),
    ];
    savedTabs.push(nextTab);
  }

  await chrome.storage.local.set({ [VAULT_STORAGE_KEY]: vault });
  const serverSynced = await syncQuickTabs(savedTabs).catch(() => false);
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "TABVAULT_CONFIGURE_HEALTH_ALERTS") {
    chrome.storage.local
      .set({ [HEALTH_ALERT_KEY]: message.settings })
      .then(restoreHealthAlarm)
      .catch(() => undefined);
    return;
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
});

chrome.alarms.onAlarm.addListener(async alarm => {
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
      `${settings.serverUrl.replace(/\/+$/, "")}/v1/index/health-check/run`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${settings.apiKey || "admin"}` },
      }
    );
    const result = await response.json();
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
