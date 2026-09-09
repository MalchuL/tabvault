import { useEffect, useMemo, useState } from "react";
import { ContextHelp } from "@/components/ContextHelp";
import {
  buildAdvancedDedupePlan,
  type AdvancedDedupeOptions,
  type DedupePlan,
  type StringReducer,
  type SurvivorRule,
  type TagsReducer,
  type ViewedReducer,
} from "@/domain/deduplication/model";
import {
  executeDedupePlan,
  type DedupeMutation,
} from "@/domain/deduplication/execution";
import type { PersistedVault, VaultTab } from "@/domain/library/types";
import {
  readApiKey,
  readExtensionVault,
  readLocalServerUrl,
  readStorageMode,
  updateTabOnLocalServer,
  writeExtensionVault,
} from "@/lib/extension";

const DEFAULT_OPTIONS: AdvancedDedupeOptions = {
  survivor: "OLDEST_CREATED",
  title: "SURVIVOR_VALUE",
  note: "CONCAT",
  agentReview: "CONCAT",
  viewed: "ANY",
  tags: "UNION",
  separator: "\n\n",
};

const OPTION_HELP: Record<string, string> = {
  NEWEST_CREATED: "Keep the Saved Tab with the most recent creation time.",
  OLDEST_CREATED: "Keep the first-created Saved Tab in each duplicate cluster.",
  LATEST_UPDATED: "Keep the Saved Tab that was updated most recently.",
  CONCAT:
    "Join every non-empty value from oldest to newest using the separator below.",
  LONGEST: "Use the longest value found across the duplicate cluster.",
  SHORTEST: "Use the shortest value found across the duplicate cluster.",
  SURVIVOR_VALUE: "Keep this property's value from the selected survivor.",
  ANY: "Mark the survivor viewed when at least one duplicate was viewed.",
  ALL: "Mark the survivor viewed only when every duplicate was viewed.",
  MAJORITY:
    "Use the majority viewed state; a tie keeps the survivor's current state.",
  UNION: "Keep every tag, merging tag names case-insensitively.",
  INTERSECTION: "Keep only tags that appear on every Saved Tab in the cluster.",
};

function visibleTabs(vault: PersistedVault) {
  const now = Date.now();
  return vault.tabs.filter(
    tab =>
      !tab.archived && (!tab.hiddenUntil || Date.parse(tab.hiddenUntil) <= now)
  );
}

function applyMutation(vault: PersistedVault, mutation: DedupeMutation) {
  const now = new Date().toISOString();
  const tabs = vault.tabs.map(tab =>
    tab.id === mutation.id
      ? mutation.role === "duplicate"
        ? {
            ...tab,
            groupId: null,
            archived: true,
            archivedAt: now,
            updatedAt: now,
          }
        : ({ ...tab, ...mutation.updates, updatedAt: now } as VaultTab)
      : tab
  );
  const tabOrders =
    mutation.role === "duplicate"
      ? Object.fromEntries(
          Object.entries(vault.tabOrders).map(([groupId, ids]) => [
            groupId,
            ids.filter(id => id !== mutation.id),
          ])
        )
      : vault.tabOrders;
  return { ...vault, tabs, tabOrders };
}

export default function Deduplicator() {
  const [vault, setVault] = useState<PersistedVault>();
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [generatedPlan, setGeneratedPlan] = useState<DedupePlan>();
  const [fixedPlan, setFixedPlan] = useState<DedupePlan>();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ succeeded: number; failed: number }>();

  useEffect(() => {
    void readExtensionVault().then(setVault);
  }, []);

  const candidates = useMemo(() => (vault ? visibleTabs(vault) : []), [vault]);
  useEffect(() => {
    let cancelled = false;
    void buildAdvancedDedupePlan(candidates, options).then(next => {
      if (!cancelled) setGeneratedPlan(next);
    });
    return () => {
      cancelled = true;
    };
  }, [candidates, options]);
  const plan = fixedPlan ?? generatedPlan;

  const execute = async () => {
    if (!vault || !plan) return;
    setRunning(true);
    setResult(undefined);
    const executionPlan = plan;
    setFixedPlan(executionPlan);
    let nextVault = vault;
    const [mode, serverUrl, apiKey] = await Promise.all([
      readStorageMode(),
      readLocalServerUrl(),
      readApiKey(),
    ]);
    const completed = await executeDedupePlan(
      executionPlan,
      async mutation => {
        if (mode === "backend")
          await updateTabOnLocalServer(
            serverUrl,
            mutation.id,
            mutation.updates,
            apiKey
          );
      },
      async mutation => {
        const candidate = applyMutation(nextVault, mutation);
        await writeExtensionVault(candidate);
        nextVault = candidate;
      }
    );
    setVault(nextVault);
    setResult(completed);
    if (!completed.failed) setFixedPlan(undefined);
    setRunning(false);
  };

  if (!vault || !plan)
    return (
      <main className="min-h-screen bg-[#f6f3ec] p-8">
        Building duplicate plan…
      </main>
    );

  return (
    <main className="min-h-screen bg-[#f6f3ec] px-5 py-6 text-[#26342c] sm:px-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold tracking-[-0.05em]">
          Advanced Deduplicator
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#697068]">
          Merge tabs with identical URLs. Hidden and archived tabs are excluded.
        </p>

        <section
          className={`mt-5 space-y-2 ${fixedPlan ? "pointer-events-none opacity-55" : ""}`}
        >
          <Choice
            label="Survivor"
            value={options.survivor}
            values={["NEWEST_CREATED", "OLDEST_CREATED", "LATEST_UPDATED"]}
            onChange={value =>
              setOptions(current => ({
                ...current,
                survivor: value as SurvivorRule,
              }))
            }
          />
          {(["title", "note", "agentReview"] as const).map(field => (
            <Choice
              key={field}
              label={field === "agentReview" ? "Agent review" : field}
              value={options[field]}
              values={["CONCAT", "LONGEST", "SHORTEST", "SURVIVOR_VALUE"]}
              onChange={value =>
                setOptions(current => ({
                  ...current,
                  [field]: value as StringReducer,
                }))
              }
            />
          ))}
          <Choice
            label="Viewed"
            value={options.viewed}
            values={["ANY", "ALL", "MAJORITY", "SURVIVOR_VALUE"]}
            onChange={value =>
              setOptions(current => ({
                ...current,
                viewed: value as ViewedReducer,
              }))
            }
          />
          <Choice
            label="Tags"
            value={options.tags}
            values={["UNION", "INTERSECTION", "SURVIVOR_VALUE"]}
            onChange={value =>
              setOptions(current => ({
                ...current,
                tags: value as TagsReducer,
              }))
            }
          />
          <div
            data-testid="dedupe-option-concat-separator"
            className="grid grid-cols-[minmax(90px,0.35fr)_minmax(0,1fr)_auto] items-center gap-3 border border-[#e1dbcf] bg-[#f9f7f1] p-3"
          >
            <label htmlFor="concat-separator" className="text-xs font-semibold">
              CONCAT separator
            </label>
            <input
              id="concat-separator"
              value={options.separator}
              onChange={event =>
                setOptions(current => ({
                  ...current,
                  separator: event.target.value,
                }))
              }
              className="w-full border border-[#d9d3c6] bg-[#fffdf8] px-3 py-2 font-mono text-xs outline-none focus:border-[#e95224]"
            />
            <ContextHelp title="CONCAT separator" side="left" align="center">
              Inserted between title, note, or Agent Review values whenever that
              property uses CONCAT. Escape sequences are treated as the
              characters you enter.
            </ContextHelp>
          </div>
        </section>

        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="font-mono text-xs uppercase text-[#687067]">
            {plan.clusters.length} cluster(s) ·{" "}
            {plan.clusters.reduce(
              (count, cluster) => count + cluster.duplicateIds.length,
              0
            )}{" "}
            to archive
          </p>
          <button
            disabled={running || !plan.clusters.length}
            onClick={() => void execute()}
            className="bg-[#e95224] px-4 py-2 text-sm font-bold text-white disabled:opacity-45"
          >
            {running
              ? "Applying fixed plan…"
              : fixedPlan
                ? "Retry fixed plan"
                : "Apply this plan"}
          </button>
        </div>
        {result && (
          <div className="mt-3 flex items-center gap-3">
            <p
              className={`text-sm ${result.failed ? "text-[#b84828]" : "text-[#46734d]"}`}
            >
              {result.succeeded} operations succeeded; {result.failed} failed.
              Re-running the same fixed plan is safe.
            </p>
            {fixedPlan && (
              <button
                onClick={() => {
                  setFixedPlan(undefined);
                  setResult(undefined);
                }}
                className="font-mono text-[9px] uppercase text-[#687067] underline"
              >
                Discard fixed plan
              </button>
            )}
          </div>
        )}

        <div className="mt-6 space-y-3">
          {plan.clusters.map(cluster => {
            const survivor = vault.tabs.find(
              tab => tab.id === cluster.survivorId
            );
            return (
              <article
                key={cluster.hash}
                className="border border-[#dcd7cc] bg-[#fffdf8] p-4"
              >
                <p className="truncate text-sm font-bold">{survivor?.url}</p>
                <p className="mt-2 font-mono text-[10px] uppercase text-[#687067]">
                  Keep {cluster.survivorId} · archive{" "}
                  {cluster.duplicateIds.join(", ")}
                </p>
                <pre className="mt-3 overflow-auto bg-[#f6f3ec] p-3 text-[10px] leading-5">
                  {JSON.stringify(cluster.survivorPatch, null, 2)}
                </pre>
              </article>
            );
          })}
          {!plan.clusters.length && (
            <p className="border border-dashed border-[#c9c2b5] p-8 text-center text-sm text-[#727970]">
              No duplicate exact-URL hashes among active visible tabs.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

function Choice({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: readonly string[];
  onChange: (value: string) => void;
}) {
  const help = OPTION_HELP[value];
  return (
    <div
      data-testid={`dedupe-option-${label.toLowerCase().replaceAll(" ", "-")}`}
      className="grid grid-cols-[minmax(90px,0.35fr)_minmax(0,1fr)_auto] items-center gap-3 border border-[#e1dbcf] bg-[#f9f7f1] p-3"
    >
      <label
        htmlFor={`dedupe-${label.toLowerCase().replaceAll(" ", "-")}`}
        className="text-xs font-semibold capitalize"
      >
        {label}
      </label>
      <select
        id={`dedupe-${label.toLowerCase().replaceAll(" ", "-")}`}
        aria-label={label}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="w-full border border-[#d9d3c6] bg-[#fffdf8] px-3 py-2 font-mono text-xs outline-none focus:border-[#e95224]"
      >
        {values.map(item => (
          <option key={item}>{item}</option>
        ))}
      </select>
      <ContextHelp
        title={`${label}: ${value.replaceAll("_", " ")}`}
        side="left"
        align="center"
      >
        {help}
      </ContextHelp>
    </div>
  );
}
