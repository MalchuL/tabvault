import { expect, it } from "vitest";
import { emptyBrowserVault } from "./codec";
import {
  changePropertyDefinition,
  ensureClientProperty,
  isPropertyDefinition,
  resolveProperty,
} from "./properties";
it("creates conventions on demand without overriding incompatible definitions", () => {
  const empty = emptyBrowserVault();
  expect(empty.propertySchema).toEqual({});
  const viewed = ensureClientProperty(empty, "viewed");
  expect(viewed.propertySchema.viewed.default).toBe(false);
  expect(
    changePropertyDefinition(viewed, "viewed", null).propertySchema
  ).toEqual({});
  const conflicting = changePropertyDefinition(empty, "viewed", {
    type: "string",
    description: "User field",
    default: "",
  });
  expect(() => ensureClientProperty(conflicting, "viewed")).toThrow(
    "must have type boolean"
  );
});
it("resolves only declared, valid values and preserves explicit JSON null", () => {
  const schema = {
    value: {
      type: "json" as const,
      description: "",
      default: { fallback: true },
    },
    count: { type: "int" as const, description: "", default: 3 },
  };
  expect(resolveProperty({ value: null }, schema, "value")).toBeNull();
  expect(resolveProperty({ count: "bad" }, schema, "count")).toBe(3);
  expect(resolveProperty({ unknown: true }, schema, "unknown")).toBeUndefined();
  for (const [name, type, value] of [
    ["bad-name", "int", 1],
    ["rank", "int", 1.5],
    ["rank", "int", Number.MAX_SAFE_INTEGER + 1],
    ["rank", "float", Infinity],
    ["rank", "json", { bad: NaN }],
  ] as const)
    expect(
      isPropertyDefinition(name, { description: "", type, default: value })
    ).toBe(false);
});
