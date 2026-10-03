import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";

test("built extension uses the shared release version", () => {
  const version = readFileSync(
    new URL("../server/VERSION.txt", import.meta.url),
    "utf8"
  ).trim();
  const manifest = JSON.parse(
    readFileSync(
      new URL("../dist/public/manifest.json", import.meta.url),
      "utf8"
    )
  );
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  assert.equal(manifest.version, version);
});
