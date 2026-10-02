/** Serialized browser persistence shared by app windows and the extension worker. */
import { emptyBrowserVault } from "./codec";
import {
  readBrowserVault,
  writeBrowserVault,
} from "@/domain/server/browserStorage";
import { recordChanges } from "./operations";
import type { PersistedVault } from "./types";
export const LIBRARY_CHANGED = "tabvault-library-committed";
/** Serialize a read/modify/write operation across browser contexts. @param {() => Promise<T>} work - Operation under the library lock. @returns {Promise<T>} Work result. */
export function withLibraryLock<T>(work: () => Promise<T>): Promise<T> {
  return navigator.locks.request("tabvault-library", work);
}
/** Commit a domain command and pending changes together before publishing. @param {(vault: PersistedVault) => PersistedVault} update - Pure mutation of latest data. @returns {Promise<PersistedVault>} Persisted result. @throws {Error} Invalid data or failed storage write. */
export function commitLibrary(
  update: (vault: PersistedVault) => PersistedVault
): Promise<PersistedVault> {
  return withLibraryLock(async () => {
    const before = (await readBrowserVault()) ?? emptyBrowserVault();
    const after = recordChanges(before, update(structuredClone(before)));
    await writeBrowserVault(after);
    publishLibrary();
    return after;
  });
}
/** Notify same-context subscribers after a successful commit. @returns {void} Dispatches a storage notification. */
export function publishLibrary() {
  globalThis.dispatchEvent(new Event(LIBRARY_CHANGED));
}
