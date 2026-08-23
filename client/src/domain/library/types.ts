import type { TabViewMode } from "@/components/TabList";

export type GroupId = string;

export type VaultGroup = {
  id: GroupId;
  name: string;
  description: string;
  category: string;
  accent: string;
  createdAt: string;
  updatedAt: string;
};

export type LibraryViewMode = TabViewMode | "groups";

export type VaultTab = {
  id: string;
  groupId: GroupId | null;
  title: string;
  url: string;
  domain: string;
  note: string;
  agentReview: string;
  viewed: boolean;
  tags: string[];
  color: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  archivedAt?: string | null;
  hiddenUntil?: string | null;
};

export type SavedSearch = {
  id: string;
  name: string;
  query: string;
  groupId: "all" | GroupId;
};

export type PersistedVault = {
  schemaVersion: 2;
  tabs: VaultTab[];
  vaultGroups: VaultGroup[];
  tagCatalog: Record<string, string>;
  tabOrders: Record<string, string[]>;
  savedSearches?: SavedSearch[];
  tabView?: LibraryViewMode;
  tombstones?: {
    tabs: string[];
    groups: string[];
  };
};

export type UndoSnapshot = {
  id: string;
  label: string;
  tabs: VaultTab[];
  tabOrders: Record<string, string[]>;
  tagCatalog: Record<string, string>;
};
