import type { CustomPropertySchema, VaultTab } from "@/domain/library/types";
export type DedupeTab = VaultTab;
export type SurvivorRule =
  | "NEWEST_CREATED"
  | "OLDEST_CREATED"
  | "LATEST_UPDATED";
export type StringReducer =
  | "CONCAT"
  | "LONGEST"
  | "SHORTEST"
  | "SURVIVOR_VALUE";
export type BooleanReducer = "ANY" | "ALL" | "MAJORITY" | "SURVIVOR_VALUE";
export type TagsReducer = "UNION" | "INTERSECTION" | "SURVIVOR_VALUE";
export type AdvancedDedupeOptions = {
  survivor: SurvivorRule;
  title: StringReducer;
  strings: StringReducer;
  booleans: BooleanReducer;
  tags: TagsReducer;
  separator: string;
};
export type DedupeClusterPlan = {
  hash: string;
  survivorId: string;
  duplicateIds: string[];
  survivorPatch: {
    title?: string;
    customProperties?: Record<string, unknown>;
    tags?: string[];
  };
};
export type DedupePlan = {
  kind: "quick" | "advanced";
  clusters: DedupeClusterPlan[];
};
/** Serialize JSON with stable object-key ordering, preserving array order. @param {unknown} value - JSON value. @returns {string} Canonical comparison text. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
/** Group occurrences using exact signatures, never changing saved URLs. @param {VaultTab[]} tabs - Eligible records. @param {(tab:VaultTab)=>string} signature - Equality key. @returns {VaultTab[][]} Duplicate groups. */
function clusters(tabs: VaultTab[], signature: (tab: VaultTab) => string) {
  const groups = new Map<string, VaultTab[]>();
  for (const tab of tabs) {
    const key = signature(tab);
    groups.set(key, [...(groups.get(key) ?? []), tab]);
  }
  return [...groups.values()]
    .filter(group => group.length > 1)
    .map(group =>
      group.sort(
        (a, b) =>
          a.timestamps.createdAt.localeCompare(b.timestamps.createdAt) ||
          a.id.localeCompare(b.id)
      )
    );
}
/** Plan exact-content cleanup, including all raw property values. @param {VaultTab[]} tabs - Visible active records. @returns {Promise<DedupePlan>} Recoverable archive plan. */
export async function buildQuickCleanPlan(
  tabs: VaultTab[]
): Promise<DedupePlan> {
  return {
    kind: "quick",
    clusters: clusters(tabs, t =>
      stableJson([
        t.content.url,
        t.content.title,
        t.annotations.customProperties,
        [...t.annotations.tags].map(s => s.toLowerCase()).sort(),
      ])
    ).map(group => ({
      hash: group[0].id,
      survivorId: group[0].id,
      duplicateIds: group.slice(1).map(t => t.id),
      survivorPatch: {},
    })),
  };
}
/** Reduce explicit strings with a selected policy. @param {string[]} values - Explicit values. @param {string} survivor - Survivor value. @param {StringReducer} rule - Merge policy. @param {string} separator - Concatenation delimiter. @returns {string} Merged string. */
function reduceStrings(
  values: string[],
  survivor: string,
  rule: StringReducer,
  separator: string
) {
  if (rule === "SURVIVOR_VALUE") return survivor;
  const unique = [...new Set(values.filter(Boolean))];
  if (rule === "CONCAT") return unique.join(separator);
  return (
    unique.sort((a, b) =>
      rule === "LONGEST" ? b.length - a.length : a.length - b.length
    )[0] ?? ""
  );
}
/** Merge URL duplicates using property types rather than property names. @param {VaultTab[]} tabs - Visible active records. @param {AdvancedDedupeOptions} options - Reviewed reducer choices. @param {CustomPropertySchema} schema - Current definitions. @returns {Promise<DedupePlan>} Survivor patches followed by duplicate archives. */
export async function buildAdvancedDedupePlan(
  tabs: VaultTab[],
  options: AdvancedDedupeOptions,
  schema: CustomPropertySchema = {}
): Promise<DedupePlan> {
  return {
    kind: "advanced",
    clusters: clusters(tabs, t => t.content.url).map(group => {
      const survivor =
        options.survivor === "OLDEST_CREATED"
          ? group[0]
          : options.survivor === "NEWEST_CREATED"
            ? group[group.length - 1]
            : [...group].sort(
                (a, b) =>
                  b.timestamps.updatedAt.localeCompare(
                    a.timestamps.updatedAt
                  ) || a.id.localeCompare(b.id)
              )[0];
      const properties = { ...survivor.annotations.customProperties };
      for (const name of new Set(
        group.flatMap(t => Object.keys(t.annotations.customProperties))
      )) {
        const explicit = group
          .filter(t => Object.hasOwn(t.annotations.customProperties, name))
          .map(t => t.annotations.customProperties[name]);
        if (!Object.hasOwn(properties, name)) properties[name] = explicit[0];
        if (
          schema[name]?.type === "string" &&
          explicit.every(v => typeof v === "string")
        )
          properties[name] = reduceStrings(
            explicit as string[],
            String(properties[name]),
            options.strings,
            options.separator
          );
        if (
          schema[name]?.type === "boolean" &&
          explicit.every(v => typeof v === "boolean")
        ) {
          const yes = explicit.filter(Boolean).length;
          properties[name] =
            options.booleans === "ANY"
              ? yes > 0
              : options.booleans === "ALL"
                ? yes === explicit.length
                : options.booleans === "MAJORITY"
                  ? yes * 2 === explicit.length
                    ? properties[name]
                    : yes * 2 > explicit.length
                  : properties[name];
        }
      }
      const names = new Map(
        group
          .flatMap(t => t.annotations.tags)
          .map(name => [name.toLowerCase(), name])
      );
      const tags =
        options.tags === "SURVIVOR_VALUE"
          ? survivor.annotations.tags
          : [...names]
              .filter(
                ([key]) =>
                  options.tags !== "INTERSECTION" ||
                  group.every(t =>
                    t.annotations.tags.some(name => name.toLowerCase() === key)
                  )
              )
              .map(([, name]) => name);
      return {
        hash: survivor.id,
        survivorId: survivor.id,
        duplicateIds: group.filter(t => t !== survivor).map(t => t.id),
        survivorPatch: {
          title: reduceStrings(
            group.map(t => t.content.title),
            survivor.content.title,
            options.title,
            options.separator
          ),
          customProperties: properties,
          tags,
        },
      };
    }),
  };
}
