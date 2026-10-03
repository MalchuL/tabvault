/**
 * Derive a stable accent from a category name without storing extra metadata.
 * The same name hashes to the same hue across browser sessions.
 * @param {string} category - Category label to color.
 * @returns {string} HSL color suitable for the category accent.
 */
export function categoryColor(category: string): string {
  let hash = 2166136261;
  for (const character of category) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `hsl(${Math.abs(hash) % 360} 38% 48%)`;
}
