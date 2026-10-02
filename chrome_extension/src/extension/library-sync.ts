/** Portable codec exports used by the built extension contract checks. */
export {
  emptyBrowserVault as defaultVault,
  fromServerDocument as serverDocumentToVault,
  toServerDocument as vaultToServerDocument,
  isPersistedVault,
} from "@/domain/library/codec";
