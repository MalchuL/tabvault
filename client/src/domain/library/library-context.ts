import { createContext, useContext } from "react";
import type { LibraryAction, LibraryState } from "./state";

export type LibraryContextValue = {
  vault: LibraryState;
  dispatch: React.Dispatch<LibraryAction>;
  persistenceStatus: "saved" | "saving" | "error";
};

export const LibraryContext = createContext<LibraryContextValue | null>(null);

/**
 * Read and mutate the current schema-v3 library.
 *
 * @returns The provider-owned vault and reducer dispatch function.
 */
export function useLibrary(): LibraryContextValue {
  const value = useContext(LibraryContext);
  if (!value) throw new Error("useLibrary must be used inside LibraryProvider");
  return value;
}
