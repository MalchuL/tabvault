import { domainFromUrl, orderKey } from "./codec";
import type { LocalSearchResponse } from "@/domain/server/search";
import type { GroupId, PersistedVault, VaultGroup, VaultTab } from "./types";

/**
 * Return whether a non-archived tab is hidden at the supplied instant.
 *
 * @param {VaultTab} tab - Saved tab being checked.
 * @param {number} now - Current instant used for consistent visibility decisions.
 * @returns {boolean} True when the active tab has a future hide deadline.
 */
export function isCurrentlyHidden(tab: VaultTab, now = Date.now()): boolean {
  return (
    !tab.archived &&
    Boolean(tab.hiddenUntil) &&
    Date.parse(tab.hiddenUntil ?? "") > now
  );
}

/**
 * Count library navigation categories from one consistent time boundary.
 *
 * @param {PersistedVault} vault - Browser library to read, write, or render.
 * @param {number} now - Current instant used for consistent visibility decisions.
 * @returns {{ activeCount: number; archivedCount: number; hiddenCount: number; tagCount: number; }} Counts of active, archived, hidden, and tagged library items.
 */
export function libraryStats(vault: PersistedVault, now = Date.now()) {
  return {
    activeCount: vault.tabs.filter(
      tab => !tab.archived && !isCurrentlyHidden(tab, now)
    ).length,
    archivedCount: vault.tabs.filter(tab => tab.archived).length,
    hiddenCount: vault.tabs.filter(tab => isCurrentlyHidden(tab, now)).length,
    tagCount: Object.keys(vault.tagCatalog).length,
  };
}

/**
 * Sort tabs by collection order followed by their stored relative order.
 *
 * @param {VaultTab[]} tabs - Tabs to sort or display.
 * @param {Pick<PersistedVault, "vaultGroups" | "tabOrders">} vault - Browser library to read, write, or render.
 * @returns {VaultTab[]} New tab array in collection and saved tab order.
 */
export function sortTabs(
  tabs: VaultTab[],
  vault: Pick<PersistedVault, "vaultGroups" | "tabOrders">
): VaultTab[] {
  return [...tabs].sort((left, right) => {
    if (left.groupId !== right.groupId)
      return (
        vault.vaultGroups.findIndex(group => group.id === left.groupId) -
        vault.vaultGroups.findIndex(group => group.id === right.groupId)
      );
    return (
      (vault.tabOrders[orderKey(left.groupId)] ?? []).indexOf(left.id) -
      (vault.tabOrders[orderKey(right.groupId)] ?? []).indexOf(right.id)
    );
  });
}

/**
 * Accept server results only for the search currently shown in All Tabs.
 *
 * @param {LocalSearchResponse | null} response - Last server search response, if any.
 * @param {string} query - Current search query.
 * @param {"all" | GroupId} groupId - Selected collection ID.
 * @param {boolean} isAllTabsPage - Whether the all-tabs view is active.
 * @returns {LocalSearchResponse | null} Response for the active query and group, or null when stale.
 */
export function currentSearchResponse(
  response: LocalSearchResponse | null,
  query: string,
  groupId: "all" | GroupId,
  isAllTabsPage: boolean
): LocalSearchResponse | null {
  return query.trim() &&
    isAllTabsPage &&
    response?.query.toLowerCase() === query.trim().toLowerCase() &&
    (response.group ?? "all") === groupId
    ? response
    : null;
}

/**
 * Reuse current browser tabs when server search returns matching IDs.
 *
 * @param {LocalSearchResponse["results"]} results - Ranked server search results.
 * @param {VaultTab[]} activeTabs - Current browser-local active tabs.
 * @param {VaultGroup[]} groups - Current collection records.
 * @param {string} now - Current instant used for consistent visibility decisions.
 * @returns {VaultTab[]} Local tab records supplemented by server-only result tabs.
 */
export function searchResultTabs(
  results: LocalSearchResponse["results"],
  activeTabs: VaultTab[],
  groups: VaultGroup[],
  now = new Date().toISOString()
): VaultTab[] {
  const tabsById = new Map(activeTabs.map(tab => [tab.id, tab]));
  const groupIds = new Set(groups.map(group => group.id));
  return results.map(({ tab }) => {
    const local = tabsById.get(tab.id);
    if (local) return local;
    return {
      id: tab.id,
      groupId: tab.groupId && groupIds.has(tab.groupId) ? tab.groupId : null,
      title: tab.title,
      url: tab.url,
      domain: domainFromUrl(tab.url),
      note: tab.note ?? "",
      agentReview: tab.agentReview ?? "",
      customProperties: tab.customProperties ?? {},
      viewed: Boolean(tab.customProperties?.viewed),
      tags: tab.tags ?? [],
      color: "#6b8c7e",
      icon: tab.title.slice(0, 1).toUpperCase() || "T",
      createdAt: tab.updatedAt ?? now,
      updatedAt: tab.updatedAt ?? now,
    };
  });
}
