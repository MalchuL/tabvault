import { expect, it } from "vitest";
import { domainFromUrl } from "./codec";

it("uses one display domain for captured and imported URLs", () => {
  expect(domainFromUrl("https://www.example.com/path")).toBe("example.com");
  expect(domainFromUrl("https://broken host/path")).toBe("broken host");
  expect(domainFromUrl("")).toBe("");
});
