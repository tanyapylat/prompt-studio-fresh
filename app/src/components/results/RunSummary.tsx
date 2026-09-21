import { Beaker, CheckCircle2, Lightbulb, Sparkles, XCircle } from "lucide-react";
import type { Assertion, RunGroup, RunInsights, SpecProject } from "../../types";
import { averageOf, formatCost, formatLatency, formatTokens, maxOf, tokensPerSecond, totalOf, type ResultRow } from "../../results";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** One "label: value" pair in the promptfoo-parity stat strip — e.g. `Avg Latency 647ms`. */
function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <span className="text-xs text-slate-500" title={title}>
      {label} <span className="font-medium text-slate-700">{value}</span>
    </span>
  );
}

const UNGROUPED = "Ungrouped";
type AssertionOutcome = "passed" | "failed";

interface AssertionStat {
  assertion: Assertion;
  passCount: number;
  total: number;
  passRate: number;
  threshold: number;
  meetsThreshold: boolean;
}

function computeAssertionStats(spec: SpecProject, run: RunGroup): AssertionStat[] {
  return spec.assertions.map((assertion) => {
    // n/a scores (this check didn't apply to that row) are excluded from both the numerator and
    // denominator — an assertion that's n/a everywhere it ran shows "no applicable rows" instead
    // of a misleading 100%/0%.
    const scores = run.results.flatMap((r) => r.scores.filter((s) => s.assertionId === assertion.id && !s.na));
    const passCount = scores.filter((s) => s.passed).length;
    const total = scores.length;
    const passRate = total ? passCount / total : 1;
    const threshold = assertion.passThreshold ?? spec.defaultPassThreshold;
    return { assertion, passCount, total, passRate, threshold, meetsThreshold: passRate >= threshold };
  });
}

/**
 * One assertion's summary as a clickable pill (promptfoo-style) — its color already communicates
 * pass/fail-against-threshold; clicking it drills the table/panel below down to "every row where
 * this specific check failed" (or passed, for a chip that's currently only showing passes) via
 * `onFilterByAssertion`, the same handler a per-row check chip in `ResultsTable` calls. Clicking
 * the already-active chip toggles the filter back off.
 */
function AssertionChip({
  stat,
  isActive,
  onFilterByAssertion,
}: {
  stat: AssertionStat;
  isActive: boolean;
  onFilterByAssertion?: (assertionId: string, outcome: AssertionOutcome) => void;
}) {
  const outcome: AssertionOutcome = stat.meetsThreshold ? "passed" : "failed";
  if (stat.total === 0) {
    return (
      <span
        title={`${stat.assertion.description} — n/a on every row it ran against`}
        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-400"
      >
        <span className="truncate">{stat.assertion.description}</span>
        <span className="shrink-0">n/a</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onFilterByAssertion?.(stat.assertion.id, outcome)}
      disabled={!onFilterByAssertion}
      title={`${stat.assertion.description} — ${Math.round(stat.passRate * 100)}% pass (threshold ${Math.round(stat.threshold * 100)}%) — click to filter results by this assertion`}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        stat.meetsThreshold
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
      } ${isActive ? "ring-2 ring-primary ring-offset-1" : ""} disabled:cursor-default disabled:opacity-90`}
    >
      {stat.meetsThreshold ? <CheckCircle2 size={12} className="shrink-0" /> : <XCircle size={12} className="shrink-0" />}
      <span className="truncate">{stat.assertion.description}</span>
      <span className="shrink-0 tabular-nums opacity-80">
        {Math.round(stat.passRate * 100)}% ({stat.passCount}/{stat.total})
      </span>
    </button>
  );
}

function AssertionRollup({
  spec,
  run,
  onFilterByAssertion,
  activeAssertionId,
  activeAssertionOutcome,
}: {
  spec: SpecProject;
  run: RunGroup;
  onFilterByAssertion?: (assertionId: string, outcome: AssertionOutcome) => void;
  activeAssertionId?: string | null;
  activeAssertionOutcome?: AssertionOutcome;
}) {
  const stats = computeAssertionStats(spec, run);
  if (stats.length === 0) return null;

  const order: string[] = [];
  const byGroup = new Map<string, AssertionStat[]>();
  for (const stat of stats) {
    const key = stat.assertion.group?.trim() || UNGROUPED;
    if (!byGroup.has(key)) {
      byGroup.set(key, []);
      order.push(key);
    }
    byGroup.get(key)!.push(stat);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="mb-2 text-xs font-semibold text-slate-800">Pass rate by assertion</p>
      <div className="space-y-3">
        {order.map((key) => (
          <div key={key}>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">{key}</p>
            <div className="flex flex-wrap gap-1.5">
              {byGroup.get(key)!.map((stat) => {
                const outcome: AssertionOutcome = stat.meetsThreshold ? "passed" : "failed";
                return (
                  <AssertionChip
                    key={stat.assertion.id}
                    stat={stat}
                    isActive={activeAssertionId === stat.assertion.id && activeAssertionOutcome === outcome}
                    onFilterByAssertion={onFilterByAssertion}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {onFilterByAssertion && (
        <p className="mt-2.5 text-[10px] text-slate-400">Click an assertion to filter the table below to its rows; click again to clear.</p>
      )}
    </div>
  );
}

/**
 * Top-of-pane summary for the current Run: headline pass rate + latency/cost aggregates, the
 * pass-rate-by-assertion rollup, and "what to review first / how to improve" suggestions. `insights`
 * is always populated (the free heuristic, computed client-side in `ResultsPane`) — `onAskNorthStar`
 * opens the chat for a deeper, AI-backed pass instead of calling that API directly (every AI
 * generation in AI Studio is narrated through North Star, not fired silently from a pane button).
 */
export function RunSummary({
  spec,
  run,
  rows,
  insights,
  onAskNorthStar,
  onReviewItem,
  onFilterByAssertion,
  activeAssertionId,
  activeAssertionOutcome,
}: {
  spec: SpecProject;
  run: RunGroup;
  rows: ResultRow[];
  insights: RunInsights;
  onAskNorthStar: () => void;
  onReviewItem: (datasetItemId: string) => void;
  /** Wires the assertion rollup's chips to the same "Check" filter a per-row check chip in `ResultsTable` sets. */
  onFilterByAssertion?: (assertionId: string, outcome: AssertionOutcome) => void;
  activeAssertionId?: string | null;
  activeAssertionOutcome?: AssertionOutcome;
}) {
  const latencies = rows.map((r) => r.result.latencyMs).filter((v): v is number => v !== undefined);
  const costs = rows.map((r) => r.result.costUsd).filter((v): v is number => v !== undefined);
  const totalTokens = rows.map((r) => r.result.tokenUsage?.totalTokens).filter((v): v is number => v !== undefined);
  const tokensPerSecValues = rows
    .map((r) => tokensPerSecond(r.result.tokenUsage?.completionTokens, r.result.latencyMs))
    .filter((v): v is number => v !== undefined);
  const avgLatency = averageOf(latencies);
  const maxLatency = maxOf(latencies);
  const totalCost = totalOf(costs);
  const totalTokensSum = totalOf(totalTokens);
  const avgTokens = averageOf(totalTokens);
  const avgTokensPerSec = averageOf(tokensPerSecValues);

  const allScores = rows.flatMap((r) => r.result.scores.filter((s) => !s.na));
  const assertsPassed = allScores.filter((s) => s.passed).length;
  const errorCount = rows.filter((r) => r.status === "error").length;

  const byItem = new Map(spec.dataset.map((d) => [d.id, d]));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-2xl font-semibold text-slate-900">{Math.round(run.passRate * 100)}%</div>
        <div className="text-xs text-slate-500">
          pass rate across {run.results.length} rows × {spec.assertions.length} assertions
        </div>
        {run.scope === "sample" && (
          <Badge tone="warning">
            <Beaker size={11} /> Sample run — {run.results.length} of {spec.dataset.length} rows
          </Badge>
        )}
        {errorCount > 0 && (
          <Badge tone="warning">
            {errorCount} error{errorCount === 1 ? "" : "s"}
          </Badge>
        )}
        {run.passRate === 1 && (
          <span className="ml-auto text-xs text-amber-700/80">
            100% pass — worth checking the dataset is actually stress-testing anything.
          </span>
        )}
      </div>

      {/* Promptfoo-parity performance/cost strip — same fields as the header line above the results
          grid there (Requests / Asserts passed / Total Cost / Total Tokens / Avg Tokens / Avg
          Latency / Tokens per Sec), aggregated over every row in this Run regardless of the table's
          current filter (`rows` is always the full, unfiltered set here). */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
        <Stat label="Requests" value={String(run.results.length)} />
        <Stat label="Asserts" value={`${assertsPassed}/${allScores.length} passed`} />
        {totalCost !== undefined && <Stat label="Total Cost" value={formatCost(totalCost)} />}
        {totalTokensSum !== undefined && <Stat label="Total Tokens" value={formatTokens(totalTokensSum)} />}
        {avgTokens !== undefined && <Stat label="Avg Tokens" value={formatTokens(Math.round(avgTokens))} />}
        {avgLatency !== undefined && (
          <Stat
            label="Avg Latency"
            value={formatLatency(avgLatency)}
            title={maxLatency !== undefined ? `Max ${formatLatency(maxLatency)}` : undefined}
          />
        )}
        {avgTokensPerSec !== undefined && <Stat label="Tokens/Sec" value={formatTokens(Math.round(avgTokensPerSec))} />}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <AssertionRollup
          spec={spec}
          run={run}
          onFilterByAssertion={onFilterByAssertion}
          activeAssertionId={activeAssertionId}
          activeAssertionOutcome={activeAssertionOutcome}
        />

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <Lightbulb size={13} className="text-amber-500" /> What to review first
            </p>
            <Button size="sm" variant="ghost" onClick={onAskNorthStar} title="Opens North Star for a deeper pass over this run's failures">
              <Sparkles size={12} /> North Star: deeper pass
            </Button>
          </div>

          {insights.reviewFirst.length === 0 && insights.improvements.length === 0 ? (
            <p className="text-xs italic text-slate-400">Nothing stands out — every row passed every assertion.</p>
          ) : (
            <div className="space-y-3">
              {insights.reviewFirst.length > 0 && (
                <div className="space-y-1">
                  {insights.reviewFirst.map((r) => {
                    const item = byItem.get(r.datasetItemId);
                    return (
                      <button
                        key={r.datasetItemId}
                        onClick={() => onReviewItem(r.datasetItemId)}
                        disabled={!item}
                        className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-slate-50 disabled:cursor-default disabled:opacity-60"
                      >
                        <XCircle size={12} className="mt-0.5 shrink-0 text-rose-600" />
                        <span className="text-slate-700">{r.reason}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {insights.improvements.length > 0 && (
                <div className="space-y-1 border-t border-slate-100 pt-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">How to improve</p>
                  <ul className="space-y-1">
                    {insights.improvements.map((line, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                        <span className="mt-1 size-1 shrink-0 rounded-full bg-slate-400" />
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <p className="mt-2 text-[10px] text-slate-400">
            Free heuristic, computed instantly from this run — North Star can do a deeper AI pass.
          </p>
        </div>
      </div>
    </div>
  );
}
