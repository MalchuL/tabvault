/** Read-only server health and ordinary text search. */
import { createTabVaultApi } from "./client";
import { DEFAULT_TABVAULT_API_KEY } from "./browserStorage";
/** Read health without registering properties or modifying the server. @param {string} url - Server URL. @param {string} apiKey - Credential. @returns {Promise<{status:string;schemaVersion:number}>} Health metadata. */
export function checkLocalServer(
  url: string,
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  return createTabVaultApi({ baseUrl: url, apiKey }).request<{
    status: string;
    schemaVersion: number;
  }>("/health");
}
