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

/** Validate a preset or a six-digit custom collection color. @param {unknown} value - Stored or entered color. @returns {boolean} Whether the color is safe to persist and render. */
export function isCollectionColor(value: unknown): boolean {
  return (
    isGroupColor(value) ||
    (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value))
  );
}

/** Get a safe swatch without rendering arbitrary stored CSS. @param {string} color - Stored preset or custom color. @returns {string} Hex swatch, or neutral grey for an incorrect value. */
export function groupColorSwatch(color: string): string {
  if (isCollectionColor(color) && !isGroupColor(color)) return color;
  return (
    GROUP_COLORS.find(([name]) => name === color)?.[1] ?? GROUP_COLORS[0][1]
  );
}

/** Map a collection color to Chrome's nearest preset using squared RGB distance. The saved custom color remains unchanged. @param {string} color - Preset or six-digit custom color. @returns {GroupColor} Supported Chrome group color. @throws {Error} Color is incorrect. */
export function chromeGroupColor(color: string): GroupColor {
  if (isGroupColor(color)) return color;
  if (!isCollectionColor(color)) throw new Error("Color is incorrect");
  let nearest: GroupColor = "grey";
  let minimum = Infinity;
  for (const [name, swatch] of GROUP_COLORS) {
    const distance = [1, 3, 5].reduce(
      (sum, offset) =>
        sum +
        (parseInt(color.slice(offset, offset + 2), 16) -
          parseInt(swatch.slice(offset, offset + 2), 16)) **
          2,
      0
    );
    if (distance < minimum) {
      nearest = name;
      minimum = distance;
    }
  }
  return nearest;
}

/** Generate a supported replacement only when requested. @returns {GroupColor} Random Chrome palette color. */
export function regenerateGroupColor(): GroupColor {
  return GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)][0];
}

/** Update one collection's persisted color without touching its tabs. @param {PersistedVault} vault - Latest library. @param {string} id - Collection identity. @param {string} color - Selected preset or six-digit custom color. @returns {PersistedVault} Updated library. @throws {Error} Color is incorrect. */
export function setCollectionColor(
  vault: PersistedVault,
  id: string,
  color: string
): PersistedVault {
  if (!isCollectionColor(color)) throw new Error("Color is incorrect");
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
