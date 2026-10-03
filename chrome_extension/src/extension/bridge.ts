/** Browser and Chrome extension operations shared by the workspace. */
import {
  openChromeTabs,
  type OpenTabGroup,
  type OpenTabsResponse,
} from "./open-tabs";
export type ChromeTabSnapshot = {
  id?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
};
/**
 * Detect whether Chrome extension storage and messaging are available.
 *
 * @returns {boolean} True when Chrome extension messaging and storage are present.
 */
export function isExtensionContext() {
  return Boolean(window.chrome?.runtime?.id && window.chrome?.storage?.local);
}
/**
 * Open distinct HTTP(S) URLs, optionally group them in Chrome, and report successful openings.
 *
 * @param {string[]} urls - Page URLs requested for opening.
 * @param {OpenTabGroup | undefined} group - Optional collection title and Chrome color.
 * @returns {Promise<OpenTabsResponse>} Requested and successful opening counts and URLs.
 * @throws {Error} Requested Chrome group color is incorrect.
 */
export async function openTabUrls(
  urls: string[],
  group?: OpenTabGroup
): Promise<OpenTabsResponse> {
  const validUrls = Array.from(
    new Set(urls.filter(url => /^https?:\/\//i.test(url)))
  );
  if (
    isExtensionContext() &&
    typeof window.chrome?.tabs?.create === "function"
  ) {
    return openChromeTabs(validUrls, group);
  }
  if (isExtensionContext() && window.chrome?.runtime?.sendMessage) {
    return window.chrome.runtime.sendMessage({
      type: "TABVAULT_OPEN_TABS",
      urls: validUrls,
      group,
    }) as Promise<OpenTabsResponse>;
  }
  // Activate anchors synchronously inside the original click gesture. This is
  // more consistently treated as navigation than repeated popup calls by
  // hosted-browser popup blockers, while the extension path above retains
  // authoritative chrome.tabs.create counts.
  let openedCount = 0;
  const openedUrls: string[] = [];
  for (const url of validUrls) {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (opened) {
      openedCount += 1;
      openedUrls.push(url);
    }
  }
  return { openedCount, requestedCount: validUrls.length, openedUrls };
}
/**
 * Set the extension alarm interval for background library refresh.
 *
 * @param {number} intervalSeconds - Seconds between extension refreshes.
 * @returns {Promise<void>} Resolves after the refresh alarm is configured.
 */
export async function configureExtensionLibraryRefresh(
  intervalSeconds: number
) {
  await window.chrome?.runtime?.sendMessage({
    type: "TABVAULT_CONFIGURE_LIBRARY_REFRESH",
    intervalSeconds,
  });
}
/**
 * Read the selected tab in the current Chrome window, if available.
 *
 * @returns {Promise<chrome.tabs.Tab>} Active Chrome tab snapshot.
 */
export async function getActiveChromeTab() {
  const result = await window.chrome?.tabs?.query({
    active: true,
    currentWindow: true,
  });
  return result?.[0];
}
/**
 * Subscribe to extension messages and return an unsubscribe function.
 *
 * @param {(message: unknown) => void} listener - Callback for extension messages.
 * @returns {() => void} Cleanup callback that unregisters the listener.
 */
export function addExtensionMessageListener(
  listener: (message: unknown) => void
) {
  window.chrome?.runtime?.onMessage.addListener(listener);
  return () => window.chrome?.runtime?.onMessage.removeListener(listener);
}
