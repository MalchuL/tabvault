import { expect, it } from "vitest";
import {
  domainFromUrl,
  emptyBrowserVault,
  fromServerDocument,
  toServerDocument,
  parseBrowserVault,
} from "./codec";
import { createSessionGroup } from "./session";

it("round-trips no color as null without changing incorrect imported values", () => {
  const vault = emptyBrowserVault();
  vault.library.vaultGroups.push(createSessionGroup());
  const document = toServerDocument(vault);
  expect(document.library.groups[0].details.color).toBeNull();
  expect(vault.library.vaultGroups[0].details).not.toHaveProperty("accent");
  vault.library.vaultGroups[0].details.accent = "none";
  expect(
    parseBrowserVault(vault)!.library.vaultGroups[0].details
  ).not.toHaveProperty("accent");
  expect(
    fromServerDocument({ ...document }).library.vaultGroups[0].details.accent
  ).toBeUndefined();
  document.library.groups[0].details.color = "incorrect";
  expect(
    fromServerDocument({ ...document }).library.vaultGroups[0].details.accent
  ).toBe("incorrect");
});

it("uses one display domain for captured and imported URLs", () => {
  expect(domainFromUrl("https://www.example.com/path")).toBe("example.com");
  expect(domainFromUrl("https://broken host/path")).toBe(
    "https://broken host/path"
  );
  expect(domainFromUrl("")).toBe("");
});
