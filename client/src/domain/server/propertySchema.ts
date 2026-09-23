import { readApiKey, readLocalServerUrl } from "./browserStorage";
import { createTabVaultApi } from "./client";

export type PropertyDefinition = {
  description: string;
  type: "int" | "float" | "string" | "boolean" | "json";
  default: unknown;
};

export type PropertySchema = Record<string, PropertyDefinition>;

const VIEWED_DEFINITION: PropertyDefinition = {
  description: "",
  type: "boolean",
  default: false,
};

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
 * Ensure the built-in viewed property has the expected boolean definition.
 * Writes the definition only when it is missing or differs from the required
 * default, so older local servers gain a compatible property schema.
 * @param {string} baseUrl - Configured local-server base URL.
 * @param {string} apiKey - Local-server API key.
 * @returns {Promise<PropertySchema>} Effective property definitions.
 */
export async function ensureViewedProperty(
  baseUrl: string,
  apiKey: string
): Promise<PropertySchema> {
  const api = createTabVaultApi({ baseUrl, apiKey });
  const response = await api.properties.get<{
    data?: { properties?: PropertySchema };
  }>();
  const properties = response.data?.properties ?? {};
  const viewed = properties.viewed;
  if (
    viewed?.type === "boolean" &&
    viewed.default === false &&
    viewed.description === ""
  )
    return properties;

  const updated = await api.properties.upsert<{
    data?: { properties?: PropertySchema };
  }>({ name: "viewed", ...VIEWED_DEFINITION });
  return (
    updated.data?.properties ?? { ...properties, viewed: VIEWED_DEFINITION }
  );
}

/**
 * Read the current schema after ensuring the built-in viewed property exists.
 * @returns {Promise<PropertySchema>} Effective property definitions.
 */
export async function getPropertySchema(): Promise<PropertySchema> {
  const [baseUrl, apiKey] = await Promise.all([
    readLocalServerUrl(),
    readApiKey(),
  ]);
  return ensureViewedProperty(baseUrl, apiKey);
}

/**
 * Create or update one custom property definition.
 * @param {string} name - Property key to persist.
 * @param {PropertyDefinition} definition - Type, description, and default value.
 * @returns {Promise<PropertySchema>} Schema returned after the update.
 */
export async function upsertPropertyDefinition(
  name: string,
  definition: PropertyDefinition
): Promise<PropertySchema> {
  const response = await (
    await configuredApi()
  ).properties.upsert<{ data: { properties: PropertySchema } }>({
    name,
    ...definition,
  });
  return response.data.properties;
}

/**
 * Remove a custom property definition by name.
 * @param {string} name - Property key to delete.
 * @returns {Promise<PropertySchema>} Schema returned after deletion.
 */
export async function deletePropertyDefinition(
  name: string
): Promise<PropertySchema> {
  const response = await (
    await configuredApi()
  ).properties.remove<{ data: { properties: PropertySchema } }>(name);
  return response.data.properties;
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
