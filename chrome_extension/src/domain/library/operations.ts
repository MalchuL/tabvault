/** Library commands shared by browser capture, editing, and synchronization. */
import { domainFromUrl, toServerDocument, fromServerDocument } from "./codec";
import { patchTab } from "./patch";
import { ensureClientProperty } from "./properties";
import { createSessionGroup } from "./session";
import type {
  PersistedVault,
  PendingChange,
  ResourceKind,
  TabPatch,
  VaultTab,
} from "./types";

/** Key a pending resource consistently. @param {ResourceKind} kind - Resource kind. @param {string} id - Identity. @returns {string} Stable storage key. */
export function resourceKey(kind: ResourceKind, id: string) {
  return JSON.stringify([kind, kind === "tag" ? id.toLowerCase() : id]);
}
/** Project library records to portable resource values. @param {PersistedVault} vault - Current library. @returns {Map<string, PendingChange>} Resource map without mutation tokens. */
export function resourceRecords(
  vault: PersistedVault
): Map<string, PendingChange> {
  const result = new Map<string, PendingChange>();
  const document = toServerDocument(vault);
  for (const [kind, records] of [
    ["tab", document.library.tabs],
    ["group", document.library.groups],
    ["tag", document.library.tags],
  ] as const) {
    for (const data of records) {
      const id = "id" in data ? data.id : data.name;
      const updatedAt =
        "timestamps" in data ? data.timestamps.updatedAt : data.updatedAt;
      result.set(resourceKey(kind, id), {
        kind,
        id,
        token: "",
        updatedAt,
        data,
      });
    }
  }
  for (const [id, data] of Object.entries(vault.propertySchema))
    result.set(resourceKey("property", id), {
      kind: "property",
      id,
      token: "",
      updatedAt: vault.sync.propertyTimes[id] ?? "1970-01-01T00:00:00.000Z",
      data,
    });
  return result;
}
/** Apply portable changes while retaining local presentation state. @param {PersistedVault} vault - Base library. @param {PendingChange[]} changes - Resource replacements/deletions. @returns {PersistedVault} Updated library. */
export function overlayChanges(
  vault: PersistedVault,
  changes: PendingChange[]
): PersistedVault {
  const document = structuredClone(toServerDocument(vault));
  const propertyTimes = { ...vault.sync.propertyTimes };
  for (const change of changes) {
    if (change.kind === "property") {
      if (change.data === null) {
        delete document.propertySchema[change.id];
        delete propertyTimes[change.id];
      } else {
        document.propertySchema[change.id] =
          change.data as PersistedVault["propertySchema"][string];
        propertyTimes[change.id] = change.updatedAt;
      }
      continue;
    }
    const key =
      change.kind === "tab"
        ? "tabs"
        : change.kind === "group"
          ? "groups"
          : "tags";
    const records = document.library[key] as Array<Record<string, unknown>>;
    const index = records.findIndex(
      r =>
        resourceKey(change.kind, String(r.id ?? r.name)) ===
        resourceKey(change.kind, change.id)
    );
    if (index >= 0) records.splice(index, 1);
    if (change.data !== null) records.push(change.data);
  }
  const groupIds = new Set(document.library.groups.map(g => g.id));
  for (const tab of document.library.tabs) {
    if (
      tab.placement.groupId !== null &&
      !groupIds.has(tab.placement.groupId)
    ) {
      tab.placement.groupId = null;
      tab.lifecycle = {
        ...tab.lifecycle,
        archived: true,
        archivedAt: tab.lifecycle.archivedAt ?? tab.timestamps.updatedAt,
      };
    }
  }
  return fromServerDocument(document, {
    ...vault,
    sync: { ...vault.sync, propertyTimes },
  });
}
/** Record changed resources atomically with their effective values. @param {PersistedVault} before - Persisted starting point. @param {PersistedVault} after - Intended library mutation. @returns {PersistedVault} Updated records with durable tokens and timestamps. */
export function recordChanges(
  before: PersistedVault,
  after: PersistedVault
): PersistedVault {
  const known = new Set(after.library.tags.map(t => t.name.toLowerCase()));
  const missing = after.library.tabs
    .flatMap(t => t.annotations.tags)
    .filter(name => {
      const key = name.toLowerCase();
      if (known.has(key)) return false;
      known.add(key);
      return true;
    });
  const now = new Date().toISOString();
  if (missing.length)
    after = {
      ...after,
      library: {
        ...after.library,
        tags: [
          ...after.library.tags,
          ...missing.map(name => ({
            name,
            description: "",
            createdAt: now,
            updatedAt: now,
          })),
        ],
      },
    };
  const old = resourceRecords(before),
    next = resourceRecords(after);
  const pending = { ...before.sync.pending };
  const changes: PendingChange[] = [];
  for (const key of new Set([...old.keys(), ...next.keys()])) {
    const prior = old.get(key),
      value = next.get(key);
    if (JSON.stringify(prior?.data) === JSON.stringify(value?.data)) continue;
    const source = value ?? prior!;
    const updatedAt = new Date(
      Math.max(Date.now(), Date.parse(prior?.updatedAt ?? "1970-01-01") + 1)
    ).toISOString();
    const data = value ? structuredClone(value.data) : null;
    if (data && source.kind !== "property") {
      if (source.kind === "tag") data.updatedAt = updatedAt;
      else data.timestamps = { ...(data.timestamps as object), updatedAt };
    }
    const change = { ...source, updatedAt, data, token: crypto.randomUUID() };
    pending[key] = change;
    changes.push(change);
  }
  return overlayChanges(
    { ...after, sync: { ...before.sync, pending } },
    changes
  );
}
/** Update one saved occurrence and enforce lifecycle invariants. @param {PersistedVault} vault - Library. @param {string} id - Tab identity. @param {TabPatch} patch - Explicit updates. @returns {PersistedVault} Mutated library. */
export function updateTab(
  vault: PersistedVault,
  id: string,
  patch: TabPatch
): PersistedVault {
  return {
    ...vault,
    library: {
      ...vault.library,
      tabs: vault.library.tabs.map(tab => {
        if (tab.id !== id) return tab;
        const next = patchTab(tab, patch);
        if (next.lifecycle.archived) {
          next.placement.groupId = null;
          next.lifecycle.archivedAt ??= new Date().toISOString();
        } else next.lifecycle.archivedAt = null;
        return next;
      }),
    },
  };
}
/** Permanently delete only archived occurrences. @param {PersistedVault} vault - Library. @param {string} id - Tab identity. @returns {PersistedVault} Updated library. @throws {Error} Active record cannot be deleted permanently. */
export function deleteTab(vault: PersistedVault, id: string): PersistedVault {
  const tab = vault.library.tabs.find(t => t.id === id);
  if (tab && !tab.lifecycle.archived)
    throw new Error("Archive the tab before permanently deleting it");
  return {
    ...vault,
    library: {
      ...vault.library,
      tabs: vault.library.tabs.filter(t => t.id !== id),
    },
  };
}
/** Archive member tabs before deleting their group. @param {PersistedVault} vault - Library. @param {string} id - Group identity. @returns {PersistedVault} Atomic group removal. */
export function deleteGroup(vault: PersistedVault, id: string): PersistedVault {
  const now = new Date().toISOString();
  return {
    ...vault,
    library: {
      ...vault.library,
      vaultGroups: vault.library.vaultGroups.filter(g => g.id !== id),
      tabs: vault.library.tabs.map(t =>
        t.placement.groupId === id
          ? patchTab(t, {
              placement: { groupId: null },
              lifecycle: { archived: true, archivedAt: now },
            })
          : t
      ),
    },
  };
}
/**
 * Switch one collection between manual and session without changing its color or tabs.
 * Custom categories and unknown identities remain unchanged. The caller commits
 * the returned vault to persist and synchronize the category change.
 * @param {PersistedVault} vault - Latest library state.
 * @param {string} id - Identity of the collection to switch.
 * @returns {PersistedVault} Library with only the selected collection's category changed.
 */
export function toggleCollectionCategory(
  vault: PersistedVault,
  id: string
): PersistedVault {
  return {
    ...vault,
    library: {
      ...vault.library,
      vaultGroups: vault.library.vaultGroups.map(group =>
        group.id === id &&
        ["manual", "session"].includes(group.details.category)
          ? {
              ...group,
              details: {
                ...group.details,
                category:
                  group.details.category === "manual" ? "session" : "manual",
              },
            }
          : group
      ),
    },
  };
}

/** Set a compatible reading-status convention only when requested. @param {PersistedVault} vault - Library. @param {string} id - Tab identity. @param {boolean} viewed - Explicit status. @returns {PersistedVault} Definition and override committed together. */
export function setViewed(
  vault: PersistedVault,
  id: string,
  viewed: boolean
): PersistedVault {
  const next = ensureClientProperty(vault, "viewed");
  const tab = next.library.tabs.find(t => t.id === id);
  return tab
    ? updateTab(next, id, {
        annotations: {
          customProperties: { ...tab.annotations.customProperties, viewed },
        },
      })
    : vault;
}
/** Capture one session without URL deduplication. @param {PersistedVault} vault - Existing library. @param {{url:string;title?:string}[]} sources - Capturable browser pages. @returns {PersistedVault} Session and occurrences to persist before closing tabs. */
export function captureTabs(
  vault: PersistedVault,
  sources: Array<{ url: string; title?: string }>
): PersistedVault {
  if (!sources.length) return vault;
  const group = createSessionGroup();
  const now = group.timestamps.createdAt;
  const tabs: VaultTab[] = sources.map((source, position) => ({
    id: crypto.randomUUID(),
    content: {
      url: source.url,
      title: source.title?.trim() || domainFromUrl(source.url),
      domain: domainFromUrl(source.url),
      color: "#6b8c7e",
      icon: "T",
    },
    annotations: { customProperties: {}, tags: [] },
    placement: { groupId: group.id, position },
    timestamps: { createdAt: now, updatedAt: now },
    lifecycle: { archived: false, archivedAt: null, hiddenUntil: null },
  }));
  return {
    ...vault,
    library: {
      ...vault.library,
      vaultGroups: [
        group,
        ...vault.library.vaultGroups.map(g => ({
          ...g,
          placement: { position: g.placement.position + 1 },
        })),
      ],
      tabs: [...tabs, ...vault.library.tabs],
    },
  };
}
/** Move and order one tab while preserving hidden/unrendered neighbors. @param {PersistedVault} vault - Library. @param {string} id - Moving tab. @param {string | null} groupId - Destination. @param {string | undefined} beforeId - Destination anchor, absent to append. @returns {PersistedVault} Atomic placement update. */
export function moveTab(
  vault: PersistedVault,
  id: string,
  groupId: string | null,
  beforeId?: string
): PersistedVault {
  const moved = vault.library.tabs.find(t => t.id === id);
  if (!moved || moved.lifecycle.archived) return vault;
  if (
    groupId !== null &&
    !vault.library.vaultGroups.some(g => g.id === groupId)
  )
    throw new Error("Unknown destination");
  const ordered = vault.library.tabs
    .filter(
      t =>
        !t.lifecycle.archived && t.placement.groupId === groupId && t.id !== id
    )
    .sort(
      (a, b) =>
        a.placement.position - b.placement.position || a.id.localeCompare(b.id)
    );
  const at = ordered.findIndex(t => t.id === beforeId);
  ordered.splice(at < 0 ? ordered.length : at, 0, moved);
  const positions = new Map(ordered.map((t, i) => [t.id, i]));
  return {
    ...vault,
    library: {
      ...vault.library,
      tabs: vault.library.tabs.map(t =>
        positions.has(t.id)
          ? { ...t, placement: { groupId, position: positions.get(t.id)! } }
          : t
      ),
    },
  };
}
/** Add, rename, or remove a tag and update every occurrence atomically. @param {PersistedVault} vault - Library. @param {string} name - Existing or new name. @param {{name?:string;description?:string}|null} value - New metadata, or confirmed detachment/deletion. @returns {PersistedVault} Catalog and links changed together. */
export function changeTag(
  vault: PersistedVault,
  name: string,
  value: { name?: string; description?: string } | null
): PersistedVault {
  const normalized = name.trim();
  if (!normalized) throw new Error("Enter a tag name");
  const old = vault.library.tags.find(
    t => t.name.toLowerCase() === normalized.toLowerCase()
  );
  const nextName = value?.name?.trim() ?? old?.name ?? normalized;
  if (value && !nextName) throw new Error("Enter a tag name");
  const now = new Date().toISOString();
  const others = vault.library.tags.filter(
    t => t.name.toLowerCase() !== normalized.toLowerCase()
  );
  const existing = others.find(
    t => t.name.toLowerCase() === nextName.toLowerCase()
  );
  if (value && existing) throw new Error("A tag with that name already exists");
  return {
    ...vault,
    library: {
      ...vault.library,
      tags: value
        ? [
            ...others,
            {
              name: nextName,
              description: value.description ?? old?.description ?? "",
              createdAt: old?.createdAt ?? now,
              updatedAt: now,
            },
          ]
        : others,
      tabs: vault.library.tabs.map(t => ({
        ...t,
        annotations: {
          ...t.annotations,
          tags: [
            ...new Set(
              t.annotations.tags.flatMap(tag =>
                tag.toLowerCase() === normalized.toLowerCase()
                  ? value
                    ? [nextName]
                    : []
                  : [tag]
              )
            ),
          ],
        },
      })),
    },
  };
}

/** Merge portable records by identity and timestamp, retaining local preferences.
 * @param {PersistedVault} current - Current committed library.
 * @param {PersistedVault} incoming - Validated import.
 * @returns {PersistedVault} New and newer records; existing definition meanings are retained.
 */
export function mergeLibrary(
  current: PersistedVault,
  incoming: PersistedVault
): PersistedVault {
  const existing = resourceRecords(current);
  const changes = [...resourceRecords(incoming)]
    .filter(([key, value]) => {
      const prior = existing.get(key);
      return (
        !prior ||
        (value.kind !== "property" &&
          Date.parse(value.updatedAt) > Date.parse(prior.updatedAt))
      );
    })
    .map(([, value]) => value);
  return overlayChanges(current, changes);
}
