export function categoryColor(category: string): string {
  let hash = 2166136261;
  for (const character of category) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `hsl(${Math.abs(hash) % 360} 38% 48%)`;
}
