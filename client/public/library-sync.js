export function defaultVault() {
  return {
    tabs: [],
    vaultGroups: [
      { id: "inbox", name: "Inbox", accent: "#F05A28" },
      { id: "research", name: "Research", accent: "#829b65" },
      {
        id: "llm-papers",
        name: "LLM papers",
        parent: "research",
        accent: "#7aa6a1",
      },
      { id: "build", name: "Build", accent: "#7c8bba" },
      { id: "filed", name: "Filed", accent: "#bb9b68" },
    ],
    tagCatalog: { "quick save": "Captured from the fast-save popup" },
    tabOrders: { inbox: [] },
    savedSearches: [],
    tabView: "standard",
  };
}

function domainFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return String(value ?? "")
      .replace(/^https?:\/\//, "")
      .split("/")[0];
  }
}

export function vaultToServerDocument(vault) {
  const groups = vault.vaultGroups || [];
  const tabs = vault.tabs || [];
  const tabOrders = vault.tabOrders || {};
  const tagCatalog = vault.tagCatalog || {};
  return {
    schemaVersion: 1,
    tags: Object.entries(tagCatalog).map(([name, description]) => ({
      name,
      description,
    })),
    groups: groups.map((group, position) => ({
      id: group.id,
      name: group.name,
      parentId: group.parent ?? null,
      color: group.accent,
      position,
    })),
    tabs: tabs.map(tab => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      note: tab.note,
      tags: tab.tags || [],
      groupId: tab.groupId,
      archived: Boolean(tab.archived),
      archivedAt: tab.archivedAt ?? null,
      position: tabOrders[tab.groupId]?.indexOf(tab.id) ?? 0,
      createdAt: tab.updated,
      updatedAt: tab.updated,
    })),
  };
}

export function serverDocumentToVault(document, fallback) {
  const remoteTabs = Array.isArray(document?.tabs) ? document.tabs : [];
  const remoteGroups = Array.isArray(document?.groups) ? document.groups : [];
  const remoteTags = Array.isArray(document?.tags) ? document.tags : [];
  const vaultGroups = remoteGroups.map(group => ({
    id: String(group.id),
    name: String(group.name),
    parent: typeof group.parentId === "string" ? group.parentId : undefined,
    accent: typeof group.color === "string" ? group.color : "#829b65",
  }));
  const tabs = remoteTabs
    .slice()
    .sort(
      (left, right) => Number(left.position ?? 0) - Number(right.position ?? 0)
    )
    .map(tab => ({
      id: String(tab.id),
      groupId: typeof tab.groupId === "string" ? tab.groupId : "inbox",
      title: String(tab.title ?? "Untitled tab"),
      url: String(tab.url ?? ""),
      domain: domainFromUrl(String(tab.url ?? "")),
      note: typeof tab.note === "string" ? tab.note : "",
      tags: Array.isArray(tab.tags) ? tab.tags.map(String) : [],
      color: "#6b8c7e",
      icon:
        String(tab.title ?? "T")
          .slice(0, 1)
          .toUpperCase() || "T",
      updated:
        typeof tab.updatedAt === "string"
          ? tab.updatedAt
          : new Date().toISOString(),
      archived: Boolean(tab.archived),
      archivedAt: typeof tab.archivedAt === "string" ? tab.archivedAt : null,
    }));
  const tabOrders = tabs.reduce((orders, tab) => {
    orders[tab.groupId] = [...(orders[tab.groupId] ?? []), tab.id];
    return orders;
  }, {});
  return {
    ...fallback,
    tabs,
    vaultGroups: vaultGroups.length ? vaultGroups : fallback.vaultGroups,
    tagCatalog: remoteTags.length
      ? remoteTags.reduce((catalog, tag) => {
          catalog[String(tag.name)] =
            typeof tag.description === "string" ? tag.description : "";
          return catalog;
        }, {})
      : fallback.tagCatalog,
    tabOrders,
  };
}
