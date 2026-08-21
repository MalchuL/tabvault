import type { TabViewMode } from "@/components/TabList";

export type GroupId = string;

export type VaultGroup = {
  id: GroupId;
  name: string;
  parent?: GroupId;
  accent: string;
};

export type LibraryViewMode = TabViewMode | "groups";

export type VaultTab = {
  id: string;
  groupId: GroupId;
  title: string;
  url: string;
  domain: string;
  note: string;
  tags: string[];
  color: string;
  icon: string;
  updated: string;
  archived?: boolean;
  archivedAt?: string | null;
};

export type SavedSearch = {
  id: string;
  name: string;
  query: string;
  groupId: "all" | GroupId;
};

export type PersistedVault = {
  tabs: VaultTab[];
  vaultGroups: VaultGroup[];
  tagCatalog: Record<string, string>;
  tabOrders: Record<GroupId, string[]>;
  savedSearches?: SavedSearch[];
  tabView?: LibraryViewMode;
};

export type UndoSnapshot = {
  id: string;
  label: string;
  tabs: VaultTab[];
  tabOrders: Record<GroupId, string[]>;
  tagCatalog: Record<string, string>;
};
