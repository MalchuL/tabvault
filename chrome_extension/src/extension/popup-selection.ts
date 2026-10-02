export type TabSelectionMode = "left" | "all" | "right" | "chrome";

/**
 * Select browser tabs relative to the active tab for a popup save action.
 * Chrome-highlighted tabs take precedence in chrome mode; without a highlight,
 * that mode falls back to the active tab. A missing active tab leaves left
 * selection empty and right selection containing the available tabs.
 * @param {chrome.tabs.Tab[]} allTabs - Tabs in browser order.
 * @param {chrome.tabs.Tab | null} activeTab - Currently active tab, if known.
 * @param {TabSelectionMode} mode - Relative or Chrome-highlight selection rule.
 * @returns {chrome.tabs.Tab[]} Tabs selected for the requested action.
 */
export function tabsForSelection(
  allTabs: chrome.tabs.Tab[],
  activeTab: chrome.tabs.Tab | null,
  mode: TabSelectionMode
) {
  const activeIndex = allTabs.findIndex(tab => tab.id === activeTab?.id);
  if (mode === "left") return allTabs.slice(0, Math.max(activeIndex, 0));
  if (mode === "all") return [...allTabs];
  if (mode === "right") return allTabs.slice(activeIndex + 1);

  const highlighted = allTabs.filter(tab => tab.highlighted);
  return highlighted.length ? highlighted : activeTab ? [activeTab] : [];
}
