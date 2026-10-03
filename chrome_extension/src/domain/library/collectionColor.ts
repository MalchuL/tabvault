import type { PersistedVault } from "./types";

/** Chrome's supported group colors and their UI swatches. */
export const GROUP_COLORS = [
  ["grey", "#80868b"],
  ["blue", "#1a73e8"],
  ["red", "#d93025"],
  ["yellow", "#f9ab00"],
  ["green", "#188038"],
  ["pink", "#d01884"],
  ["purple", "#a142f4"],
  ["cyan", "#007b83"],
  ["orange", "#fa903e"],
] as const;
export type GroupColor = (typeof GROUP_COLORS)[number][0];

/** Validate an untrusted Chrome group color without coercion. @param {unknown} value - Stored or entered color. @returns {boolean} Whether Chrome accepts the value. */
export function isGroupColor(value: unknown): value is GroupColor {
  return GROUP_COLORS.some(([name]) => name === value);
}

/** Get a safe swatch without rendering arbitrary stored CSS. @param {string} color - Stored group color. @returns {string} Palette swatch, or neutral grey for an incorrect value. */
export function groupColorSwatch(color: string): string {
  return (
    GROUP_COLORS.find(([name]) => name === color)?.[1] ?? GROUP_COLORS[0][1]
  );
}

/** Generate a supported replacement only when requested. @returns {GroupColor} Random Chrome palette color. */
export function regenerateGroupColor(): GroupColor {
  return GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)][0];
}

/** Update one collection's persisted color without touching its tabs. @param {PersistedVault} vault - Latest library. @param {string} id - Collection identity. @param {string} color - Selected Chrome color. @returns {PersistedVault} Updated library. @throws {Error} Color is incorrect. */
export function setCollectionColor(
  vault: PersistedVault,
  id: string,
  color: string
): PersistedVault {
  if (!isGroupColor(color)) throw new Error("Color is incorrect");
  return {
    ...vault,
    library: {
      ...vault.library,
      vaultGroups: vault.library.vaultGroups.map(group =>
        group.id === id
          ? { ...group, details: { ...group.details, accent: color } }
          : group
      ),
    },
  };
}
