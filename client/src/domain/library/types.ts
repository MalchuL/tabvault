export type GroupId = string;

export type TabViewMode = "standard" | "compact" | "preview";

/** Collection details for VaultGroup. */
type VaultGroupDetails = {
  name: string;
  description: string;
  category: string;
  accent: string;
};
/** Creation and modification times for VaultGroup. */
type VaultGroupTimestamps = { createdAt: string; updatedAt: string };
export type VaultGroup = {
  id: GroupId;
  details: VaultGroupDetails;
  timestamps: VaultGroupTimestamps;
};

export type LibraryViewMode = TabViewMode | "groups";

export type CustomPropertyType =
  | "int"
  | "float"
  | "string"
  | "boolean"
  | "json";

export type CustomPropertyDefinition = {
  description: string;
  type: CustomPropertyType;
  default: unknown;
};

export type CustomPropertySchema = Record<string, CustomPropertyDefinition>;

/** Collection membership and ordering for VaultTab. */
type VaultTabPlacement = { groupId: GroupId | null };
/** Display content for VaultTab. */
type VaultTabContent = {
  title: string;
  url: string;
  domain: string;
  color: string;
  icon: string;
};
/** Notes, review, and tag state for VaultTab. */
type VaultTabAnnotations = {
  note: string;
  agentReview: string;
  viewed: boolean;
  customProperties: Record<string, unknown>;
  tags: string[];
};
/** Creation and modification times for VaultTab. */
type VaultTabTimestamps = { createdAt: string; updatedAt: string };
/** Archive and hidden state for VaultTab. */
type VaultTabLifecycle = {
  archived?: boolean;
  archivedAt?: string | null;
  hiddenUntil?: string | null;
};
export type VaultTab = {
  id: string;
  placement: VaultTabPlacement;
  content: VaultTabContent;
  annotations: VaultTabAnnotations;
  timestamps: VaultTabTimestamps;
  lifecycle: VaultTabLifecycle;
};

export type SavedSearch = {
  id: string;
  name: string;
  query: string;
  groupId: "all" | GroupId;
};

/** Library records and mutation handlers for PersistedVault. */
type PersistedVaultLibrary = {
  tabs: VaultTab[];
  vaultGroups: VaultGroup[];
  tagCatalog: Record<string, string>;
  tabOrders: Record<string, string[]>;
  savedSearches?: SavedSearch[];
  tombstones?: {
    tabs: string[];
    groups: string[];
  };
};
/** Saved presentation preferences for PersistedVault. */
type PersistedVaultPreferences = { tabView?: LibraryViewMode };
export type PersistedVault = {
  schemaVersion: 4;
  propertySchema: CustomPropertySchema;
  library: PersistedVaultLibrary;
  preferences: PersistedVaultPreferences;
};

export type UndoSnapshot = {
  id: string;
  label: string;
  tabs: VaultTab[];
  tabOrders: Record<string, string[]>;
  tagCatalog: Record<string, string>;
};

/** Partial values for each tab group; omitted fields retain their current value. */
export type TabPatch = {
  content?: Partial<VaultTab["content"]>;
  annotations?: Partial<VaultTab["annotations"]>;
  placement?: Partial<VaultTab["placement"]>;
  lifecycle?: Partial<VaultTab["lifecycle"]>;
  timestamps?: Partial<VaultTab["timestamps"]>;
};
