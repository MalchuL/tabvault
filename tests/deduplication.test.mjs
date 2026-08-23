import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAdvancedDedupePlan,
  buildQuickCleanPlan,
} from "../client/src/domain/deduplication/model.ts";
import { executeDedupePlan } from "../client/src/domain/deduplication/execution.ts";

function tab(id, overrides = {}) {
  return {
    id,
    url: "https://example.com/path?a=1#part",
    title: "Example",
    note: "note",
    agentReview: "review",
    viewed: false,
    tags: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("Quick Clean hashes exact fields and applies its fixed reducers", async () => {
  const plan = await buildQuickCleanPlan([
    tab("b", { tags: ["Alpha"], createdAt: "2026-01-01T00:00:00Z" }),
    tab("a", {
      tags: ["alpha", "Beta"],
      viewed: true,
      createdAt: "2026-01-01T00:00:00Z",
    }),
    tab("different-fragment", {
      url: "https://example.com/path?a=1#other",
    }),
    tab("different-note", { note: "other" }),
  ]);

  assert.equal(plan.clusters.length, 1);
  assert.equal(plan.clusters[0].survivorId, "a");
  assert.deepEqual(plan.clusters[0].duplicateIds, ["b"]);
  assert.deepEqual(plan.clusters[0].survivorPatch.tags, ["alpha", "Beta"]);
  assert.equal(plan.clusters[0].survivorPatch.viewed, true);
});

test("length-delimited Quick Clean fields do not admit boundary ambiguity", async () => {
  const plan = await buildQuickCleanPlan([
    tab("left", { url: "ab", title: "c" }),
    tab("right", { url: "a", title: "bc" }),
  ]);
  assert.deepEqual(plan.clusters, []);
});

test("advanced plan honors survivor and reducer tie rules", async () => {
  const plan = await buildAdvancedDedupePlan(
    [
      tab("old", {
        title: "same",
        note: "",
        agentReview: "old review",
        viewed: true,
        tags: ["Shared", "old"],
        createdAt: "2025-01-01T00:00:00Z",
      }),
      tab("survivor", {
        title: "same",
        note: "medium",
        agentReview: "new review",
        viewed: false,
        tags: ["shared", "new"],
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2027-01-01T00:00:00Z",
      }),
    ],
    {
      survivor: "LATEST_UPDATED",
      title: "LONGEST",
      note: "SHORTEST",
      agentReview: "CONCAT",
      viewed: "MAJORITY",
      tags: "INTERSECTION",
      separator: " | ",
    }
  );

  const cluster = plan.clusters[0];
  assert.equal(cluster.survivorId, "survivor");
  assert.equal(cluster.survivorPatch.title, "same");
  assert.equal(cluster.survivorPatch.note, "");
  assert.equal(cluster.survivorPatch.agentReview, "old review | new review");
  assert.equal(cluster.survivorPatch.viewed, false);
  assert.deepEqual(cluster.survivorPatch.tags, ["Shared"]);
});

test("execution skips a cluster after survivor failure and continues after duplicate failure", async () => {
  const mutations = [];
  const applied = [];
  const result = await executeDedupePlan(
    {
      kind: "quick",
      clusters: [
        {
          hash: "one",
          survivorId: "failed-survivor",
          duplicateIds: ["must-not-run"],
          survivorPatch: { viewed: true },
        },
        {
          hash: "two",
          survivorId: "kept",
          duplicateIds: ["failed-duplicate", "archived"],
          survivorPatch: { tags: ["merged"] },
        },
      ],
    },
    async mutation => {
      mutations.push(mutation.id);
      if (mutation.id.startsWith("failed")) throw new Error("failure");
    },
    mutation => applied.push(mutation.id)
  );

  assert.deepEqual(mutations, [
    "failed-survivor",
    "kept",
    "failed-duplicate",
    "archived",
  ]);
  assert.deepEqual(applied, ["kept", "archived"]);
  assert.deepEqual(result, { succeeded: 2, failed: 2 });
});
