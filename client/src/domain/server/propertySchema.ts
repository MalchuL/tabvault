import { readApiKey, readLocalServerUrl } from "./browserStorage";
import { createTabVaultApi } from "./client";
import type {
  CustomPropertyDefinition,
  CustomPropertySchema,
} from "@/domain/library/types";
export type PropertyDefinition = CustomPropertyDefinition;
export type PropertySchema = CustomPropertySchema;

/**
 * Read the browser's current connection settings for a property-schema request.
 * @returns {Promise<ReturnType<typeof createTabVaultApi>>} API client bound to the stored URL and key.
 */
async function configuredApi() {
  const [baseUrl, apiKey] = await Promise.all([
    readLocalServerUrl(),
    readApiKey(),
  ]);
  return createTabVaultApi({ baseUrl, apiKey });
}

/**
 * Ask the server to count stored values that violate current definitions.
 * @returns {Promise<{ valid: boolean; summary: { tabsScanned: number; invalidValues: number; undeclaredValues: number } }>} Validation status and counts.
 */
export async function validatePropertyValues() {
  const response = await (
    await configuredApi()
  ).request<{
    data: {
      valid: boolean;
      summary: {
        tabsScanned: number;
        invalidValues: number;
        undeclaredValues: number;
      };
    };
  }>("/property-schema/validation");
  return response.data;
}

/**
 * Ask the server to repair stored values using current definitions.
 * @returns {Promise<{ tabsScanned: number; converted: number; removed: number; unchanged: number }>} Repair counts.
 */
export async function repairPropertyValues() {
  const response = await (
    await configuredApi()
  ).request<{
    data: {
      tabsScanned: number;
      converted: number;
      removed: number;
      unchanged: number;
    };
  }>("/property-schema/repair", { method: "POST" });
  return response.data;
}
