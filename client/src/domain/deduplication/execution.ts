import type { DedupePlan } from "./model";

export type DedupeMutation = {
  id: string;
  updates: Record<string, unknown>;
  role: "survivor" | "duplicate";
};

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
