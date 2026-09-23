import type { DedupePlan } from "./model";

export type DedupeMutation = {
  id: string;
  updates: Record<string, unknown>;
  role: "survivor" | "duplicate";
};

/**
 * Apply each cluster's survivor patch before archiving its duplicates.
 * A failed survivor update leaves that cluster's duplicates untouched, so
 * their data is not lost. Other clusters continue after a failure.
 * @param {DedupePlan} plan - Reviewed duplicate clusters and survivor patches.
 * @param {(mutation: DedupeMutation) => Promise<void>} mutate - Persist one change.
 * @param {(mutation: DedupeMutation) => void | Promise<void>} onSuccess - Update local state after persistence.
 * @returns {Promise<{ succeeded: number; failed: number }>} Counts of successful and failed mutations.
 */
export async function executeDedupePlan(
  plan: DedupePlan,
  mutate: (mutation: DedupeMutation) => Promise<void>,
  onSuccess: (mutation: DedupeMutation) => void | Promise<void>
) {
  let succeeded = 0;
  let failed = 0;
  for (const cluster of plan.clusters) {
    const survivor: DedupeMutation = {
      id: cluster.survivorId,
      updates: cluster.survivorPatch,
      role: "survivor",
    };
    try {
      await mutate(survivor);
      await onSuccess(survivor);
      succeeded += 1;
    } catch {
      failed += 1;
      // Keep duplicates when the survivor patch failed; they may hold unique data.
      continue;
    }
    for (const id of cluster.duplicateIds) {
      const duplicate: DedupeMutation = {
        id,
        updates: { archived: true, groupId: null },
        role: "duplicate",
      };
      try {
        await mutate(duplicate);
        await onSuccess(duplicate);
        succeeded += 1;
      } catch {
        failed += 1;
      }
    }
  }
  return { succeeded, failed };
}
