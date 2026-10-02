/** Explicit transfer operations; normal mutations use the shared sync transaction. */
import { createTabVaultApi } from "./client";
import { DEFAULT_TABVAULT_API_KEY } from "./browserStorage";
/** Back up and explicitly clear the server library. @param {string} url - Server URL. @param {string} apiKey - Credential. @returns {Promise<unknown>} Completed clear response. */
export function clearLibraryOnServer(
  url: string,
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  return createTabVaultApi({ baseUrl: url, apiKey }).request("/library", {
    method: "DELETE",
  });
}
