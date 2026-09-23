import type { MouseEvent } from "react";
import type { TabListItem } from "@/domain/library/components/tabs/TabList";

/**
 * Route primary and middle clicks through the workspace's saved-tab opener.
 * The opener records viewed state before opening the URL in the browser.
 * @param {MouseEvent<HTMLElement>} event - Click or auxiliary click on a saved link.
 * @param {TabListItem} tab - Saved tab whose viewed state is updated.
 * @param {(tab: TabListItem, url?: string) => void} onOpen - Workspace-owned open action.
 * @param {string} url - Optional destination when the link differs from the saved URL.
 */
export function openSavedLink(
  event: MouseEvent<HTMLElement>,
  tab: TabListItem,
  onOpen: (tab: TabListItem, url?: string) => void,
  url?: string
): void {
  if (event.type === "auxclick" && event.button !== 1) return;
  event.preventDefault();
  onOpen(tab, url);
}

/**
 * Open a link inside sanitized reader HTML using its article URL as the base.
 * Events outside anchors leave the reader scroll and selection behavior alone.
 * @param {MouseEvent<HTMLDivElement>} event - Click from the rendered reader body.
 * @param {TabListItem} tab - Saved source tab for the viewed-state update.
 * @param {(tab: TabListItem, url?: string) => void} onOpen - Workspace-owned open action.
 * @param {string} articleUrl - Base URL for relative links in the article.
 */
export function openReaderLink(
  event: MouseEvent<HTMLDivElement>,
  tab: TabListItem,
  onOpen: (tab: TabListItem, url?: string) => void,
  articleUrl: string
): void {
  const anchor = (event.target as Element).closest("a");
  const href = anchor?.getAttribute("href");
  if (!href) return;
  openSavedLink(event, tab, onOpen, new URL(href, articleUrl).toString());
}
