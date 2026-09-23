export type DedupeTab = {
  id: string;
  url: string;
  title: string;
  note: string;
  agentReview: string;
  viewed: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type SurvivorRule =
  | "NEWEST_CREATED"
  | "OLDEST_CREATED"
  | "LATEST_UPDATED";
export type StringReducer =
  | "CONCAT"
  | "LONGEST"
  | "SHORTEST"
  | "SURVIVOR_VALUE";
export type ViewedReducer = "ANY" | "ALL" | "MAJORITY" | "SURVIVOR_VALUE";
export type TagsReducer = "UNION" | "INTERSECTION" | "SURVIVOR_VALUE";

export type AdvancedDedupeOptions = {
  survivor: SurvivorRule;
  title: StringReducer;
  note: StringReducer;
  agentReview: StringReducer;
  viewed: ViewedReducer;
  tags: TagsReducer;
  separator: string;
};

export type DedupeClusterPlan = {
  hash: string;
  survivorId: string;
  duplicateIds: string[];
  survivorPatch: {
    title?: string;
    note?: string;
    agentReview?: string;
    viewed?: boolean;
    tags?: string[];
  };
};

export type DedupePlan = {
  kind: "quick" | "advanced";
  clusters: DedupeClusterPlan[];
};

/**
 * Encode fields with length prefixes before hashing a duplicate signature.
 * Prefixes keep adjacent values distinct from a single concatenated value.
 * @param {string[]} fields - Ordered values included in the signature.
 * @returns {Uint8Array} UTF-8 bytes with a four-byte length before each value.
 */
function bytesForFields(fields: string[]) {
  const encoder = new TextEncoder();
  const encoded = fields.map(field => encoder.encode(field));
  const total = encoded.reduce((size, value) => size + 4 + value.length, 0);
  const output = new Uint8Array(total);
  const view = new DataView(output.buffer);
  let offset = 0;
  for (const value of encoded) {
    view.setUint32(offset, value.length, false);
    offset += 4;
    output.set(value, offset);
    offset += value.length;
  }
  return output;
}

/**
 * Hash an ordered set of tab fields into a stable duplicate key.
 * @param {string[]} fields - Values to encode in their current order.
 * @returns {Promise<string>} Lowercase hexadecimal SHA-256 digest.
 */
async function sha256(fields: string[]) {
  const digest = await crypto.subtle.digest("SHA-256", bytesForFields(fields));
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

/**
 * Parse a timestamp for deterministic sorting, treating invalid values as epoch zero.
 * @param {string} value - Stored timestamp string.
 * @returns {number} Milliseconds since the epoch, or zero when parsing fails.
 */
function instant(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Order tabs by creation time, breaking ties by stable ID.
 * @param {DedupeTab} left - First tab to compare.
 * @param {DedupeTab} right - Second tab to compare.
 * @returns {number} Comparator result for ascending sort order.
 */
function oldestFirst(left: DedupeTab, right: DedupeTab) {
  return (
    instant(left.createdAt) - instant(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

/**
 * Combine tags case-insensitively while keeping the oldest tab's spelling.
 * @param {DedupeTab[]} tabs - Cluster members whose tags are merged.
 * @returns {string[]} Distinct tags ordered by their first occurrence.
 */
function caseInsensitiveUnion(tabs: DedupeTab[]) {
  const result = new Map<string, string>();
  for (const tab of [...tabs].sort(oldestFirst))
    for (const tag of tab.tags) {
      const key = tag.toLocaleLowerCase();
      if (!result.has(key)) result.set(key, tag);
    }
  return Array.from(result.values());
}

/**
 * Keep tags present on every tab, using the first tab's spelling and order.
 * @param {DedupeTab[]} tabs - Cluster members to compare.
 * @returns {string[]} Tags common to every member.
 */
function caseInsensitiveIntersection(tabs: DedupeTab[]) {
  const first = caseInsensitiveUnion(tabs.slice(0, 1));
  return first.filter(tag =>
    tabs
      .slice(1)
      .every(tab =>
        tab.tags.some(
          candidate => candidate.toLocaleLowerCase() === tag.toLocaleLowerCase()
        )
      )
  );
}

/**
 * Group tabs by a selected field signature and omit unique signatures.
 * Hashing runs concurrently; each retained cluster has at least two members.
 * @param {DedupeTab[]} tabs - Candidate tabs for duplicate detection.
 * @param {(tab: DedupeTab) => string[]} fields - Ordered signature fields per tab.
 * @returns {Promise<Array<[string, DedupeTab[]]>>} Duplicate hashes and their members.
 */
async function clustersBy(
  tabs: DedupeTab[],
  fields: (tab: DedupeTab) => string[]
) {
  const groups = new Map<string, DedupeTab[]>();
  await Promise.all(
    tabs.map(async tab => {
      const hash = await sha256(fields(tab));
      groups.set(hash, [...(groups.get(hash) ?? []), tab]);
    })
  );
  return Array.from(groups.entries()).filter(
    ([, members]) => members.length > 1
  );
}

/**
 * Plan exact-content duplicate removal without mutating tabs.
 * The oldest tab survives; tags are unioned and viewed state is true if any
 * member was viewed. The plan can be reviewed before execution.
 * @param {DedupeTab[]} tabs - Tabs eligible for quick cleanup.
 * @returns {Promise<DedupePlan>} Clusters, survivor IDs, and patches to apply.
 */
export async function buildQuickCleanPlan(
  tabs: DedupeTab[]
): Promise<DedupePlan> {
  const groups = await clustersBy(tabs, tab => [
    tab.url,
    tab.title,
    tab.note,
    tab.agentReview,
  ]);
  return {
    kind: "quick",
    clusters: groups.map(([hash, members]) => {
      const sorted = [...members].sort(oldestFirst);
      const survivor = sorted[0];
      return {
        hash,
        survivorId: survivor.id,
        duplicateIds: sorted.slice(1).map(tab => tab.id),
        survivorPatch: {
          tags: caseInsensitiveUnion(sorted),
          viewed: sorted.some(tab => tab.viewed),
        },
      };
    }),
  };
}

/**
 * Select one cluster survivor by the requested timestamp rule.
 * Equal timestamps resolve by ID so repeated planning chooses the same tab.
 * @param {DedupeTab[]} tabs - Nonempty duplicate cluster.
 * @param {SurvivorRule} rule - Creation or update ordering to apply.
 * @returns {DedupeTab} Tab retained by the plan.
 */
function selectSurvivor(tabs: DedupeTab[], rule: SurvivorRule) {
  return [...tabs].sort((left, right) => {
    const comparison =
      rule === "LATEST_UPDATED"
        ? instant(right.updatedAt) - instant(left.updatedAt)
        : rule === "NEWEST_CREATED"
          ? instant(right.createdAt) - instant(left.createdAt)
          : instant(left.createdAt) - instant(right.createdAt);
    return comparison || left.id.localeCompare(right.id);
  })[0];
}

/**
 * Merge one text field according to the configured reducer.
 * Concatenation follows oldest-first order; equal-length choices favor the
 * survivor, then the oldest matching tab.
 * @param {DedupeTab[]} tabs - Nonempty duplicate cluster.
 * @param {DedupeTab} survivor - Tab retained by the plan.
 * @param {"title" | "note" | "agentReview"} field - Text field being merged.
 * @param {StringReducer} reducer - Merge rule for that field.
 * @param {string} separator - Text inserted between concatenated values.
 * @returns {string} Text to store on the survivor.
 */
function reduceString(
  tabs: DedupeTab[],
  survivor: DedupeTab,
  field: "title" | "note" | "agentReview",
  reducer: StringReducer,
  separator: string
) {
  if (reducer === "SURVIVOR_VALUE") return survivor[field];
  const ordered = [...tabs].sort(oldestFirst);
  if (reducer === "CONCAT")
    return ordered
      .map(tab => tab[field])
      .filter(Boolean)
      .join(separator);
  const wanted = reducer === "LONGEST" ? Math.max : Math.min;
  const targetLength = ordered.reduce(
    (length, tab) => wanted(length, tab[field].length),
    ordered[0][field].length
  );
  if (survivor[field].length === targetLength) return survivor[field];
  return (
    ordered.find(tab => tab[field].length === targetLength)?.[field] ??
    survivor[field]
  );
}

/**
 * Resolve a cluster's viewed state, using the survivor to break majority ties.
 * @param {DedupeTab[]} tabs - Nonempty duplicate cluster.
 * @param {DedupeTab} survivor - Tab retained by the plan.
 * @param {ViewedReducer} reducer - Boolean merge rule.
 * @returns {boolean} Viewed state to store on the survivor.
 */
function reduceViewed(
  tabs: DedupeTab[],
  survivor: DedupeTab,
  reducer: ViewedReducer
) {
  if (reducer === "SURVIVOR_VALUE") return survivor.viewed;
  const viewed = tabs.filter(tab => tab.viewed).length;
  if (reducer === "ANY") return viewed > 0;
  if (reducer === "ALL") return viewed === tabs.length;
  const unviewed = tabs.length - viewed;
  return viewed === unviewed ? survivor.viewed : viewed > unviewed;
}

/**
 * Plan URL-based duplicate removal with independent merge rules per field.
 * The plan preserves every cluster's chosen survivor and lists the other IDs
 * for deletion; it does not change storage until executed separately.
 * @param {DedupeTab[]} tabs - Tabs eligible for advanced cleanup.
 * @param {AdvancedDedupeOptions} options - Survivor and field merge rules.
 * @returns {Promise<DedupePlan>} Reviewable clusters and survivor patches.
 */
export async function buildAdvancedDedupePlan(
  tabs: DedupeTab[],
  options: AdvancedDedupeOptions
): Promise<DedupePlan> {
  const groups = await clustersBy(tabs, tab => [tab.url]);
  return {
    kind: "advanced",
    clusters: groups.map(([hash, members]) => {
      const survivor = selectSurvivor(members, options.survivor);
      return {
        hash,
        survivorId: survivor.id,
        duplicateIds: members
          .filter(tab => tab.id !== survivor.id)
          .sort(oldestFirst)
          .map(tab => tab.id),
        survivorPatch: {
          title: reduceString(
            members,
            survivor,
            "title",
            options.title,
            options.separator
          ),
          note: reduceString(
            members,
            survivor,
            "note",
            options.note,
            options.separator
          ),
          agentReview: reduceString(
            members,
            survivor,
            "agentReview",
            options.agentReview,
            options.separator
          ),
          viewed: reduceViewed(members, survivor, options.viewed),
          tags:
            options.tags === "SURVIVOR_VALUE"
              ? survivor.tags
              : options.tags === "INTERSECTION"
                ? caseInsensitiveIntersection(members)
                : caseInsensitiveUnion(members),
        },
      };
    }),
  };
}
