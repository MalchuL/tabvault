import type {
  CustomPropertyDefinition,
  CustomPropertySchema,
  CustomPropertyType,
  PersistedVault,
} from "./types";

/**
 * Check whether a value is finite JSON without coercing its type.
 * @param {unknown} value - Candidate default or stored override.
 * @returns {boolean} Whether the entire value can be persisted as JSON.
 */
export function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.values(value).every(isJsonValue)
  );
}

/**
 * Validate a property value against its declared type without coercion.
 * @param {unknown} value - Candidate default or explicit override.
 * @param {CustomPropertyType} type - Declared property type.
 * @returns {boolean} Whether the value matches; integers must remain exact in JavaScript.
 */
export function matchesPropertyType(
  value: unknown,
  type: CustomPropertyType
): boolean {
  switch (type) {
    case "int":
      return typeof value === "number" && Number.isSafeInteger(value);
    case "float":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "string":
      return typeof value === "string";
    case "json":
      return isJsonValue(value);
    default:
      return false;
  }
}

/**
 * Validate a definition at browser and server persistence boundaries.
 * @param {string} name - Case-sensitive property name.
 * @param {unknown} value - Untrusted property definition.
 * @returns {boolean} Whether the name, description, type, and default are valid.
 */
export function isPropertyDefinition(
  name: string,
  value: unknown
): value is CustomPropertyDefinition {
  if (
    !/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(name) ||
    typeof value !== "object" ||
    value === null
  )
    return false;
  const definition = value as CustomPropertyDefinition;
  return (
    typeof definition.description === "string" &&
    definition.description.length <= 1000 &&
    matchesPropertyType(definition.default, definition.type)
  );
}

/**
 * Replace or remove one definition; library persistence records the pending change.
 * @param {PersistedVault} vault - Current library.
 * @param {string} name - Case-sensitive property name.
 * @param {CustomPropertyDefinition | null} definition - Definition, or deletion.
 * @returns {PersistedVault} Updated library preserving raw tab overrides.
 * @throws {Error} Invalid name, type, or default.
 */
export function changePropertyDefinition(
  vault: PersistedVault,
  name: string,
  definition: CustomPropertyDefinition | null
): PersistedVault {
  if (
    !/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(name) ||
    (definition !== null && !isPropertyDefinition(name, definition))
  )
    throw new Error("Invalid property definition");
  const propertySchema = { ...vault.propertySchema };
  if (definition === null) delete propertySchema[name];
  else propertySchema[name] = definition;
  return { ...vault, propertySchema };
}
/** Resolve a declared property without materializing a default. @param {Record<string, unknown>} raw - Stored overrides. @param {CustomPropertySchema} schema - Current definitions. @param {string} name - Property name. @returns {unknown} Valid value or default. */
export function resolveProperty(
  raw: Record<string, unknown>,
  schema: CustomPropertySchema,
  name: string
): unknown {
  const definition = schema[name];
  if (!definition) return undefined;
  return Object.hasOwn(raw, name) &&
    matchesPropertyType(raw[name], definition.type)
    ? raw[name]
    : definition.default;
}
export const CLIENT_PROPERTIES: CustomPropertySchema = {
  note: { description: "Saved note", type: "string", default: "" },
  agentReview: {
    description: "Agent-written review",
    type: "string",
    default: "",
  },
  viewed: {
    description: "Whether this saved tab has been viewed",
    type: "boolean",
    default: false,
  },
};
/** Register a missing client convention without overwriting existing meaning. @param {PersistedVault} vault - Current library. @param {string} name - Supported convention. @returns {PersistedVault} Library with a compatible definition. @throws {Error} Incompatible or unknown convention. */
export function ensureClientProperty(
  vault: PersistedVault,
  name: string
): PersistedVault {
  const expected = CLIENT_PROPERTIES[name];
  if (!expected) throw new Error("Unknown client convention");
  if (vault.propertySchema[name]) {
    if (vault.propertySchema[name].type !== expected.type)
      throw new Error(
        `Property ${name} must have type ${expected.type} for this action`
      );
    return vault;
  }
  return changePropertyDefinition(vault, name, expected);
}
