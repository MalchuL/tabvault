import type { TabPatch, VaultTab } from "./types";

/**
 * Merge a tab patch without discarding untouched fields in a nested group.
 * @param {VaultTab} tab - Current saved record.
 * @param {TabPatch} patch - Grouped values to replace.
 * @returns {VaultTab} New saved record retaining all unspecified values.
 */
export function patchTab(tab: VaultTab, patch: TabPatch): VaultTab {
  return {
    ...tab,
    content: { ...tab.content, ...patch.content },
    annotations: { ...tab.annotations, ...patch.annotations },
    placement: { ...tab.placement, ...patch.placement },
    lifecycle: { ...tab.lifecycle, ...patch.lifecycle },
    timestamps: { ...tab.timestamps, ...patch.timestamps },
  };
}
