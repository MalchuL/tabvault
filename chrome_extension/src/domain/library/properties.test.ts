import { expect, it } from "vitest";
import { emptyBrowserVault } from "./codec";
import { captureTabs } from "./operations";
import {
  changePropertyDefinition,
  ensureClientProperty,
  isPropertyDefinition,
  resolveProperty,
  removePropertyEverywhere,
  unsetTabProperty,
} from "./properties";
it("removes raw keys from one tab or throughout the library without assigning defaults", () => {
  const vault = captureTabs(emptyBrowserVault(), [
    { url: "https://example.com/a" },
    { url: "https://example.com/b" },
  ]);
  vault.propertySchema.payload = {
    type: "json",
    description: "",
    default: { fallback: true },
  };
  for (const tab of vault.library.tabs)
    tab.annotations.customProperties = {
      payload: null,
      other: false,
      undeclared: 0,
    };
  const first = unsetTabProperty(vault.library.tabs[0], "payload");
  expect(first.annotations.customProperties).toEqual({
    other: false,
    undeclared: 0,
  });
  expect(vault.library.tabs[1].annotations.customProperties).toHaveProperty(
    "payload",
    null
  );
  const cleared = removePropertyEverywhere(vault, "payload");
  expect(cleared.propertySchema).not.toHaveProperty("payload");
  expect(
    cleared.library.tabs.every(
      tab => !Object.hasOwn(tab.annotations.customProperties, "payload")
    )
  ).toBe(true);
  const undeclared = removePropertyEverywhere(cleared, "undeclared");
  expect(
    undeclared.library.tabs.map(tab => tab.annotations.customProperties)
  ).toEqual([{ other: false }, { other: false }]);
  expect(unsetTabProperty(first, "missing")).toBe(first);
});
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
