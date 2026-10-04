import { expect, it } from "vitest";
import { emptyBrowserVault } from "./codec";
import {
  chromeGroupColor,
  GROUP_COLORS,
  groupColorSwatch,
  isCollectionColor,
  isGroupColor,
  setCollectionColor,
} from "./collectionColor";

it("accepts safe custom colors and maps them to Chrome presets without changing storage", () => {
  for (const [name, swatch] of GROUP_COLORS) {
    expect(chromeGroupColor(name)).toBe(name);
    expect(chromeGroupColor(swatch.toUpperCase())).toBe(name);
  }
  expect(chromeGroupColor("#1a74e9")).toBe("blue");
  expect(groupColorSwatch("#123ABC")).toBe("#123ABC");
  expect(isGroupColor("#123ABC")).toBe(false);
  for (const invalid of [
    "",
    "#123",
    "#12345678",
    "#zzzzzz",
    "url(test)",
    null,
  ]) {
    expect(isCollectionColor(invalid)).toBe(false);
  }
  expect(groupColorSwatch("url(test)")).toBe(GROUP_COLORS[0][1]);
  expect(() => chromeGroupColor("url(test)")).toThrow("Color is incorrect");
  expect(() =>
    setCollectionColor(emptyBrowserVault(), "test", "url(test)")
  ).toThrow("Color is incorrect");
  const vault = emptyBrowserVault();
  vault.library.vaultGroups.push({
    id: "test",
    details: {
      name: "Test",
      category: "manual",
      description: "",
      accent: "blue",
    },
    placement: { position: 0 },
    timestamps: {
      createdAt: "2026-10-03T00:00:00.000Z",
      updatedAt: "2026-10-03T00:00:00.000Z",
    },
  });
  const updated = setCollectionColor(vault, "test", "#123ABC");
  expect(updated.library.vaultGroups[0].details.accent).toBe("#123ABC");
  expect(vault.library.vaultGroups[0].details.accent).toBe("blue");
  expect(updated.library.tabs).toBe(vault.library.tabs);
});
