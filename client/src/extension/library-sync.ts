import {
  emptyBrowserVault,
  fromServerDocument,
  isPersistedVault,
  migratePersistedVault,
  orderKey,
  toServerDocument,
  utcTimestamp,
} from "@/domain/library/codec";
import type { PersistedVault } from "@/domain/library/types";

export { orderKey, utcTimestamp };
export const defaultVault = emptyBrowserVault;
export { isPersistedVault };
export const upgradeVault = migratePersistedVault;
export const vaultToServerDocument = toServerDocument;

/**
 * Convert a server document while retaining browser-only preferences.
 *
 * @param {Record<string, unknown>} document - Schema-v3 local-server transfer document.
 * @param {PersistedVault} preferences - Existing browser preferences and deletion tombstones.
 * @returns {PersistedVault} A browser-ready schema-v3 vault.
 */
export function serverDocumentToVault(
  document: Record<string, unknown>,
  preferences: PersistedVault = emptyBrowserVault()
) {
  return fromServerDocument(document, preferences);
}
