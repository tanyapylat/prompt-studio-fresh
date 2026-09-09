import { Beaker, CheckCircle2, Lightbulb, Sparkles, XCircle } from "lucide-react";
import type { Assertion, RunGroup, RunInsights, SpecProject } from "../../types";
import { averageOf, formatCost, formatLatency, totalOf, type ResultRow } from "../../results";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const UNGROUPED = "Ungrouped";

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
    const scores = run.results.flatMap((r) => r.scores.filter((s) => s.assertionId === assertion.id));
    const passCount = scores.filter((s) => s.passed).length;
    const total = scores.length;
    const passRate = total ? passCount / total : 1;
    const threshold = assertion.passThreshold ?? spec.defaultPassThreshold;
    return { assertion, passCount, total, passRate, threshold, meetsThreshold: passRate >= threshold };
  });
}

function AssertionRollup({ spec, run }: { spec: SpecProject; run: RunGroup }) {
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
            <div className="space-y-1">
              {byGroup.get(key)!.map((stat) => (
                <div key={stat.assertion.id} className="flex items-center gap-2 text-xs">
                  {stat.meetsThreshold ? (
                    <CheckCircle2 size={13} className="shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle size={13} className="shrink-0 text-rose-600" />
                  )}
                  <span className="flex-1 truncate text-slate-700">{stat.assertion.description}</span>
                  <span className={stat.meetsThreshold ? "text-slate-500" : "text-rose-700"}>
                    {Math.round(stat.passRate * 100)}% ({stat.passCount}/{stat.total}) — threshold{" "}
                    {Math.round(stat.threshold * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
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
}: {
  spec: SpecProject;
  run: RunGroup;
  rows: ResultRow[];
  insights: RunInsights;
  onAskNorthStar: () => void;
  onReviewItem: (datasetItemId: string) => void;
}) {
  const latencies = rows.map((r) => r.result.latencyMs).filter((v): v is number => v !== undefined);
  const costs = rows.map((r) => r.result.costUsd).filter((v): v is number => v !== undefined);
  const avgLatency = averageOf(latencies);
  const totalCost = totalOf(costs);

  const byItem = new Map(spec.dataset.map((d) => [d.id, d]));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-2xl font-semibold text-slate-900">{Math.round(run.passRate * 100)}%</div>
        <div className="text-xs text-slate-500">
          pass rate across {run.results.length} rows × {spec.assertions.length} checks
        </div>
        {run.scope === "sample" && (
          <Badge tone="warning">
            <Beaker size={11} /> Sample run — {run.results.length} of {spec.dataset.length} rows
          </Badge>
        )}
        {avgLatency !== undefined && (
          <span className="text-xs text-slate-500">
            avg latency <span className="font-medium text-slate-700">{formatLatency(avgLatency)}</span>
          </span>
        )}
        {totalCost !== undefined && (
          <span className="text-xs text-slate-500">
            total cost <span className="font-medium text-slate-700">{formatCost(totalCost)}</span>
          </span>
        )}
        {run.passRate === 1 && (
          <span className="ml-auto text-xs text-amber-700/80">
            100% pass — worth checking the dataset is actually stress-testing anything.
          </span>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <AssertionRollup spec={spec} run={run} />

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
            <p className="text-xs italic text-slate-400">Nothing stands out — every row passed every check.</p>
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
