export type GroupId = string;
export type TabViewMode = "standard" | "compact";
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
export type RecordTimes = { createdAt: string; updatedAt: string };
export type VaultGroup = {
  id: GroupId;
  details: {
    name: string;
    description: string;
    category: string;
    /** Optional preset or custom hex; absence uses default styling, while incorrect imports remain available for repair. */
    accent?: string;
  };
  placement: { position: number };
  timestamps: RecordTimes;
};
export type VaultTab = {
  id: string;
  placement: { groupId: GroupId | null; position: number };
  content: {
    title: string;
    url: string;
    domain: string;
    color: string;
    icon: string;
  };
  annotations: { customProperties: Record<string, unknown>; tags: string[] };
  timestamps: RecordTimes;
  lifecycle: {
    archived: boolean;
    archivedAt: string | null;
    hiddenUntil: string | null;
  };
};
export type VaultTag = {
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};
export type ResourceKind = "tab" | "group" | "tag" | "property";
export type PendingChange = {
  kind: ResourceKind;
  id: string;
  token: string;
  updatedAt: string;
  data: Record<string, unknown> | null;
};
export type SyncMetadata = {
  generation: string | null;
  pending: Record<string, PendingChange>;
  propertyTimes: Record<string, string>;
};
export type PersistedVault = {
  schemaVersion: 5;
  propertySchema: CustomPropertySchema;
  library: {
    tabs: VaultTab[];
    vaultGroups: VaultGroup[];
    tags: VaultTag[];
  };
  preferences: { tabView: LibraryViewMode };
  sync: SyncMetadata;
};
export type TabPatch = {
  content?: Partial<VaultTab["content"]>;
  annotations?: Partial<VaultTab["annotations"]>;
  placement?: Partial<VaultTab["placement"]>;
  lifecycle?: Partial<VaultTab["lifecycle"]>;
  timestamps?: Partial<VaultTab["timestamps"]>;
};
