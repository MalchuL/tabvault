import { createContext, useContext } from "react";
import type { LibraryAction } from "./state";
import type { PersistedVault } from "./types";
import type { SyncStatus } from "@/domain/server/browserStorage";
export type LibraryContextValue = {
  vault: PersistedVault;
  dispatch: React.Dispatch<LibraryAction>;
  mutate: (
    update: (vault: PersistedVault) => PersistedVault
  ) => Promise<PersistedVault>;
  persistenceStatus: "saved" | "saving" | "error";
  syncStatus: SyncStatus | undefined;
  synchronize: () => Promise<void>;
};
export const LibraryContext = createContext<LibraryContextValue | null>(null);
/** Read the committed library and shared commands. @returns {LibraryContextValue} Context. @throws {Error} Provider is missing. */
export function useLibrary() {
  const value = useContext(LibraryContext);
  if (!value) throw new Error("useLibrary must be used inside LibraryProvider");
  return value;
}
