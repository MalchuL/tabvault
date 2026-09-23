import { orderKey } from "./codec";
import type { PersistedVault, VaultTab } from "./types";

/** Return whether a non-archived tab is hidden at the supplied instant. */
export function isCurrentlyHidden(tab: VaultTab, now = Date.now()): boolean {
  return (
    !tab.archived &&
    Boolean(tab.hiddenUntil) &&
    Date.parse(tab.hiddenUntil ?? "") > now
  );
}

/** Count library navigation categories from one consistent time boundary. */
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

/** Sort tabs by collection order followed by their stored relative order. */
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
