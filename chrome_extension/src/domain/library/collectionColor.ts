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

/** Validate an absent color, a preset, or a six-digit custom color. @param {unknown} value - Stored or entered color. @returns {boolean} Whether the value is safe to persist and render. */
export function isCollectionColor(value: unknown): boolean {
  return (
    value === undefined ||
    isGroupColor(value) ||
    (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value))
  );
}

/** Get a safe swatch without rendering arbitrary stored CSS. @param {string | undefined} color - Stored collection color, absent when cleared. @returns {string} Hex swatch, or transparent for no color or an incorrect value. */
export function groupColorSwatch(color: string | undefined): string {
  if (color === undefined || !isCollectionColor(color)) return "transparent";
  if (!isGroupColor(color)) return color;
  return (
    GROUP_COLORS.find(([name]) => name === color)?.[1] ?? GROUP_COLORS[0][1]
  );
}

/** Tint a collection surface without changing content opacity. @param {string | undefined} color - Stored collection color, absent when cleared. @param {number} opacity - Color percentage mixed into the surface, from zero to one hundred. @returns {string | undefined} Safe CSS tint, or undefined so existing default styling applies to absent or incorrect colors. */
export function groupColorBackground(
  color: string | undefined,
  opacity: number
): string | undefined {
  const swatch = groupColorSwatch(color);
  return swatch === "transparent"
    ? undefined
    : `color-mix(in srgb, ${swatch} ${opacity}%, #fffdf8)`;
}

/** Map a collection color to Chrome's nearest preset using squared RGB distance. Chrome requires a palette color, so absence uses neutral grey without persisting it. @param {string | undefined} color - Optional preset or six-digit custom color. @returns {GroupColor} Supported Chrome group color. @throws {Error} Color is incorrect. */
export function chromeGroupColor(color: string | undefined): GroupColor {
  if (color === undefined) return "grey";
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

/** Update or clear one collection's color without touching its tabs. @param {PersistedVault} vault - Latest library. @param {string} id - Collection identity. @param {string | undefined} color - Selected preset or hex, or undefined to remove the stored key. @returns {PersistedVault} Updated library. @throws {Error} Color is incorrect. */
export function setCollectionColor(
  vault: PersistedVault,
  id: string,
  color: string | undefined
): PersistedVault {
  if (!isCollectionColor(color)) throw new Error("Color is incorrect");
  return {
    ...vault,
    library: {
      ...vault.library,
      vaultGroups: vault.library.vaultGroups.map(group => {
        if (group.id !== id) return group;
        const details = { ...group.details };
        if (color === undefined) delete details.accent;
        else details.accent = color;
        return { ...group, details };
      }),
    },
  };
}
