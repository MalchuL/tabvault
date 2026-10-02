import { resolveProperty } from "./properties";
import type { PersistedVault, VaultTab } from "./types";
/** Test visibility at one consistent instant. @param {VaultTab} tab - Saved occurrence. @param {number} now - Current milliseconds. @returns {boolean} Whether the tab is hidden. */
export function isCurrentlyHidden(tab: VaultTab, now = Date.now()) {
  return (
    !tab.lifecycle.archived &&
    Boolean(tab.lifecycle.hiddenUntil) &&
    Date.parse(tab.lifecycle.hiddenUntil ?? "") > now
  );
}
/** Derive sidebar counts from current data. @param {PersistedVault} vault - Library. @param {number} now - Visibility instant. @returns {object} Navigation counts. */
export function libraryStats(vault: PersistedVault, now = Date.now()) {
  return {
    activeCount: vault.library.tabs.filter(
      t => !t.lifecycle.archived && !isCurrentlyHidden(t, now)
    ).length,
    archivedCount: vault.library.tabs.filter(t => t.lifecycle.archived).length,
    hiddenCount: vault.library.tabs.filter(t => isCurrentlyHidden(t, now))
      .length,
    tagCount: vault.library.tags.length,
  };
}
/** Sort by group position, then occurrence position. @param {VaultTab[]} tabs - Records. @param {Pick<PersistedVault,"library">} vault - Group placement data. @returns {VaultTab[]} Ordered copy. */
export function sortTabs(
  tabs: VaultTab[],
  vault: Pick<PersistedVault, "library">
) {
  const groups = new Map(
    vault.library.vaultGroups.map(g => [g.id, g.placement.position])
  );
  return [...tabs].sort(
    (a, b) =>
      (groups.get(a.placement.groupId ?? "") ?? -1) -
        (groups.get(b.placement.groupId ?? "") ?? -1) ||
      a.placement.position - b.placement.position ||
      a.id.localeCompare(b.id)
  );
}
/** Match text against titles, original URLs, tags, and resolved custom properties. @param {VaultTab[]} tabs - Visibility-filtered records. @param {string} query - Text query. @param {PersistedVault} vault - Property definitions. @returns {VaultTab[]} Matches ranked using the server's text-score rule. */
export function searchTabs(
  tabs: VaultTab[],
  query: string,
  vault: PersistedVault
) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return tabs;
  return tabs
    .map(tab => {
      const properties = Object.fromEntries(
        Object.keys(vault.propertySchema)
          .sort()
          .map(name => [
            name,
            resolveProperty(
              tab.annotations.customProperties,
              vault.propertySchema,
              name
            ),
          ])
      );
      const fields = [
        tab.content.title,
        tab.content.url,
        JSON.stringify(properties),
        tab.annotations.tags.join(" "),
      ].map(text => text.toLowerCase());
      const score = Math.max(
        ...fields.map(text => terms.filter(term => text.includes(term)).length)
      );
      return { tab, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.tab.id.localeCompare(b.tab.id))
    .map(item => item.tab);
}
