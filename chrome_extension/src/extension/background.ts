import { captureTabs } from "@/domain/library/operations";
import { commitLibrary } from "@/domain/library/store";
import { synchronizeLibrary } from "@/domain/server/sync";
import {
  readBrowserVault,
  readStorageMode,
  readLibraryRefreshInterval,
  readSyncStatus,
} from "@/domain/server/browserStorage";
const REFRESH_ALARM = "tabvault-library-refresh";
/** Persist a complete session before closing capturable source tabs. @param {chrome.tabs.Tab[]} source - Requested browser tabs. @returns {Promise<object>} Capture, close, and sync counts. @throws {Error} Local persistence fails; source tabs remain open. */
async function saveAndCloseTabs(source: chrome.tabs.Tab[]) {
  const valid = source.filter(
    (tab): tab is chrome.tabs.Tab & { id: number; url: string } =>
      typeof tab.id === "number" &&
      typeof tab.url === "string" &&
      /^https?:\/\//i.test(tab.url)
  );
  if (valid.length) await commitLibrary(vault => captureTabs(vault, valid));
  const closed = await Promise.allSettled(
    valid.map(tab => chrome.tabs.remove(tab.id))
  );
  let serverSynced = false;
  try {
    await synchronizeLibrary();
    serverSynced = (await readStorageMode()) === "backend";
  } catch {
    /* The persisted session remains pending for retry. */
  }
  return {
    savedCount: valid.length,
    closedCount: closed.filter(r => r.status === "fulfilled").length,
    skippedCount: source.length - valid.length,
    failedCount: 0,
    serverSynced,
  };
}
/** Open supported URLs without aborting after an individual failure. @param {string[]} urls - Requested URLs. @returns {Promise<object>} Successfully opened URLs and counts. */
async function openVaultTabs(urls: string[]) {
  const valid = [...new Set(urls)].filter(url => /^https?:\/\//i.test(url));
  const openedUrls: string[] = [];
  for (const url of valid) {
    try {
      await chrome.tabs.create({ url, active: false });
      openedUrls.push(url);
    } catch {
      /* Return partial success to the caller. */
    }
  }
  return {
    openedUrls,
    openedCount: openedUrls.length,
    requestedCount: valid.length,
  };
}
/** Install the durable retry alarm and remove obsolete index-health alarms. @returns {Promise<void>} Alarm installation. */
async function restoreAlarms() {
  await chrome.alarms.clear("tabvault-index-health");
  await chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 1 });
}
chrome.runtime.onInstalled.addListener(() => void restoreAlarms());
chrome.runtime.onStartup.addListener(() => void restoreAlarms());
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  let work: Promise<unknown>;
  if (message?.type === "TABVAULT_FAST_SAVE_AND_CLOSE")
    work = saveAndCloseTabs(message.tabs ?? []);
  else if (message?.type === "TABVAULT_OPEN_TABS")
    work = openVaultTabs(message.urls ?? []);
  else if (message?.type === "TABVAULT_REFRESH_LIBRARY")
    work = synchronizeLibrary().then(() => ({ success: true, synced: true }));
  else if (message?.type === "TABVAULT_CONFIGURE_LIBRARY_REFRESH")
    work = restoreAlarms().then(() => ({ success: true }));
  else return;
  void work.then(sendResponse).catch(error =>
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  );
  return true;
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== REFRESH_ALARM) return;
  void (async () => {
    if ((await readStorageMode()) !== "backend") return;
    const [vault, interval, status] = await Promise.all([
      readBrowserVault(),
      readLibraryRefreshInterval(),
      readSyncStatus(),
    ]);
    if (
      Object.keys(vault?.sync.pending ?? {}).length ||
      (interval > 0 &&
        Date.now() - (status?.serverSyncedAt ?? 0) >= interval * 1000)
    )
      await synchronizeLibrary();
  })().catch(() => undefined);
});
chrome.commands.onCommand.addListener(async command => {
  if (command !== "save-current-tab") return;
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (!tab?.id || !tab.windowId) return;
  await chrome.sidePanel
    .open({ windowId: tab.windowId })
    .catch(() => undefined);
  void chrome.runtime
    .sendMessage({ type: "TABVAULT_CAPTURE_ACTIVE", tab })
    .catch(() => undefined);
});
void restoreAlarms();
