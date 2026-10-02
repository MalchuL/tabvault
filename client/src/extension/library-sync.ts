import {
  emptyBrowserVault,
  fromServerDocument,
  isPersistedVault,
  orderKey,
  toServerDocument,
  utcTimestamp,
} from "@/domain/library/codec";
import type { PersistedVault } from "@/domain/library/types";

export { orderKey, utcTimestamp };
export const defaultVault = emptyBrowserVault;
export { isPersistedVault };
export const vaultToServerDocument = toServerDocument;

/**
 * Convert a server document while retaining browser-only preferences.
 *
 * @param {Record<string, unknown>} document - Schema-v4 local-server transfer document.
 * @param {PersistedVault} preferences - Existing browser preferences and deletion tombstones.
 * @returns {PersistedVault} A browser-ready schema-v4 vault.
 */
export function serverDocumentToVault(
  document: Record<string, unknown>,
  preferences: PersistedVault = emptyBrowserVault()
) {
  return fromServerDocument(document, preferences);
}
