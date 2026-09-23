import {
  inspectBrowserVault,
  readExtensionVault,
  writeExtensionVault,
} from "@/domain/server/synchronization";

/** Canonical browser persistence operations for schema-v3 vaults. */
export const vaultStorage = {
  inspect: inspectBrowserVault,
  load: readExtensionVault,
  save: writeExtensionVault,
};
