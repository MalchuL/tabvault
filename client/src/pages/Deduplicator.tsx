import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useEffect, useMemo, useState } from "react";
import { ContextHelp } from "@/components/shared/ContextHelp";
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
import { useLibrary } from "@/domain/library/library-context";
import { updateTabOnLocalServer } from "@/domain/server/libraryApi";
import {
  readApiKey,
  readLocalServerUrl,
  readStorageMode,
} from "@/domain/server/browserStorage";

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

/**
 * Select active, currently visible tabs as duplicate candidates.
 * Archived tabs and tabs hidden until a future instant are left untouched.
 * @param {PersistedVault} vault - Current browser library.
 * @returns {VaultTab[]} Tabs eligible for duplicate planning.
 */
function visibleTabs(vault: PersistedVault) {
  const now = Date.now();
  return vault.tabs.filter(
    tab =>
      !tab.archived && (!tab.hiddenUntil || Date.parse(tab.hiddenUntil) <= now)
  );
}

/**
 * Mirror one completed server mutation into browser state.
 * Duplicate tabs are archived and removed from every order bucket; survivor
 * patches preserve their existing placement.
 * @param {PersistedVault} vault - Current browser library.
 * @param {DedupeMutation} mutation - Successfully persisted dedupe change.
 * @returns {PersistedVault} Updated local library snapshot.
 */
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

/**
 * Review and execute duplicate plans against visible saved tabs.
 * Keeps the selected plan fixed while mutations run so UI option changes
 * cannot alter the in-flight operation.
 * @returns {JSX.Element} Dedupe options, preview, and execution results.
 */
export default function Deduplicator() {
  const { vault, dispatch } = useLibrary();
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [generatedPlan, setGeneratedPlan] = useState<DedupePlan>();
  const [fixedPlan, setFixedPlan] = useState<DedupePlan>();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ succeeded: number; failed: number }>();

  const candidates = useMemo(() => visibleTabs(vault), [vault]);
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

  /**
   * Apply the selected deduplication plan.
   *
   * Run the plan against the current library and report the mutation result.
   * @returns {Promise<void>} Resolves after the deduplication attempt.
   */
  const execute = async () => {
    if (!plan) return;
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
      mutation => {
        nextVault = applyMutation(nextVault, mutation);
      }
    );
    dispatch({ type: "replace", vault: nextVault });
    setResult(completed);
    if (!completed.failed) setFixedPlan(undefined);
    setRunning(false);
  };

  if (!plan)
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
            <Input
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
          <Button
            disabled={running || !plan.clusters.length}
            onClick={() => void execute()}
            className="bg-[#e95224] px-4 py-2 text-sm font-bold text-white disabled:opacity-45"
          >
            {running
              ? "Applying fixed plan…"
              : fixedPlan
                ? "Retry fixed plan"
                : "Apply this plan"}
          </Button>
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
              <Button
                variant="ghost"
                onClick={() => {
                  setFixedPlan(undefined);
                  setResult(undefined);
                }}
                className="font-mono text-[9px] uppercase text-[#687067] underline"
              >
                Discard fixed plan
              </Button>
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

/**
 * Render one dedupe rule selector with contextual explanation of its value.
 * @param {{ label: string; value: string; values: readonly string[]; onChange: (value: string) => void }} props - Rule label, options, selection, and change action.
 * @returns {JSX.Element} Labeled selector and help marker.
 */
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
      <NativeSelect
        id={`dedupe-${label.toLowerCase().replaceAll(" ", "-")}`}
        aria-label={label}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="w-full border border-[#d9d3c6] bg-[#fffdf8] px-3 py-2 font-mono text-xs outline-none focus:border-[#e95224]"
      >
        {values.map(item => (
          <option key={item}>{item}</option>
        ))}
      </NativeSelect>
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
