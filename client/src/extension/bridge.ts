/** Browser and Chrome extension operations shared by the workspace. */

import type { IndexHealthCheck } from "@/domain/server/search";

export type ChromeTabSnapshot = {
  id?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
};

type OpenTabsResponse = {
  openedCount: number;
  requestedCount: number;
  openedUrls: string[];
};

/**
 * Detect whether Chrome extension storage and messaging are available.
 *
 * @returns {boolean} True when Chrome extension messaging and storage are present.
 */
export function isExtensionContext() {
  return Boolean(window.chrome?.runtime?.id && window.chrome?.storage?.local);
}

export type ReadablePageSource = {
  html: string;
  url: string;
};

type ReadablePageResponse = Partial<ReadablePageSource> & { error?: string };

/**
 * Fetch a page through the extension when available, or from the web app.
 *
 * @param {string} url - Absolute HTTP(S) server or page URL.
 * @returns {Promise<ReadablePageSource>} Fetched HTML and final page URL.
 * @throws {Error} When the URL is unsupported, fetching fails, or the response lacks HTML.
 */
export async function fetchReadablePageSource(
  url: string
): Promise<ReadablePageSource> {
  if (!/^https?:\/\//i.test(url))
    throw new Error("Only HTTP(S) pages can be rendered as readable previews.");

  if (isExtensionContext() && window.chrome?.runtime?.sendMessage) {
    const result = (await window.chrome.runtime.sendMessage({
      type: "TABVAULT_FETCH_READABLE_PAGE",
      url,
    })) as ReadablePageResponse;
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

/**
 * Open distinct HTTP(S) URLs and report only successfully opened tabs.
 *
 * @param {string[]} urls - Page URLs requested for opening.
 * @returns {Promise<OpenTabsResponse>} Requested and successful opening counts and URLs.
 */
export async function openTabUrls(urls: string[]): Promise<OpenTabsResponse> {
  const validUrls = Array.from(
    new Set(urls.filter(url => /^https?:\/\//i.test(url)))
  );
  if (isExtensionContext() && window.chrome?.tabs?.create) {
    let openedCount = 0;
    const openedUrls: string[] = [];
    for (const url of validUrls) {
      try {
        await window.chrome.tabs.create({ url, active: false });
        openedCount += 1;
        openedUrls.push(url);
      } catch {
        // Continue opening the remainder and report the completed count.
      }
    }
    return { openedCount, requestedCount: validUrls.length, openedUrls };
  }
  if (isExtensionContext() && window.chrome?.runtime?.sendMessage) {
    return window.chrome.runtime.sendMessage({
      type: "TABVAULT_OPEN_TABS",
      urls: validUrls,
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
 * Mirror a server health schedule into Chrome's local notification alarm.
 *
 * @param {string} serverUrl - Configured local-server URL.
 * @param {IndexHealthCheck} healthCheck - Server health-check schedule and alert state.
 * @param {string} apiKey - API key for the local server.
 * @returns {Promise<void>} Resolves after the health alert alarm is configured.
 */
export async function configureExtensionHealthAlerts(
  serverUrl: string,
  healthCheck: IndexHealthCheck,
  apiKey: string
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
