import { useState } from "react";
import { Beaker, CheckCircle2, ChevronDown, ChevronRight, XCircle, Zap, ZapOff } from "lucide-react";
import { useStore } from "../../store";
import type { Assertion, SpecProject } from "../../types";
import { datasetItemLabel, datasetVariableNames } from "../../dataset";
import { Badge } from "../ui";

const UNGROUPED = "Ungrouped";

interface AssertionStat {
  assertion: Assertion;
  passCount: number;
  total: number;
  passRate: number;
  threshold: number;
  meetsThreshold: boolean;
}

function computeAssertionStats(spec: SpecProject, run: SpecProject["runs"][number]): AssertionStat[] {
  return spec.assertions.map((assertion) => {
    const scores = run.results.flatMap((r) => r.scores.filter((s) => s.assertionId === assertion.id));
    const passCount = scores.filter((s) => s.passed).length;
    const total = scores.length;
    const passRate = total ? passCount / total : 1;
    const threshold = assertion.passThreshold ?? spec.defaultPassThreshold;
    return { assertion, passCount, total, passRate, threshold, meetsThreshold: passRate >= threshold };
  });
}

function AssertionRollup({ spec, run }: { spec: SpecProject; run: SpecProject["runs"][number] }) {
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

export function ResultsPane({ spec }: { spec: SpecProject }) {
  const { updateSpec } = useStore();
  const lastRun = spec.runs[spec.runs.length - 1];
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!lastRun) {
    return <p className="text-sm text-slate-500">No run yet — click Generate (or Run) in the top bar to see results.</p>;
  }

  const variableNames = datasetVariableNames(spec.target?.messages);
  const rows = lastRun.results
    .map((r) => ({
      ...r,
      item: spec.dataset.find((d) => d.id === r.datasetItemId),
      failCount: r.scores.filter((s) => !s.passed).length,
    }))
    .sort((a, b) => b.failCount - a.failCount);

  function setNote(itemId: string, note: string) {
    updateSpec(spec.id, (s) => ({
      ...s,
      runs: s.runs.map((run) =>
        run.id === lastRun.id
          ? { ...run, results: run.results.map((r) => (r.datasetItemId === itemId ? { ...r, note } : r)) }
          : run,
      ),
    }));
  }

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-2xl font-semibold text-slate-900">{Math.round(lastRun.passRate * 100)}%</div>
        <div className="text-xs text-slate-500">
          pass rate across {lastRun.results.length} rows × {spec.assertions.length} checks
        </div>
        {lastRun.scope === "sample" ? (
          <Badge tone="warning">
            <Beaker size={11} /> Sample run — {lastRun.results.length} of {spec.dataset.length} rows
          </Badge>
        ) : lastRun.citable ? (
          <Badge tone="accent">Citable</Badge>
        ) : (
          <Badge>Dry run (non-citable)</Badge>
        )}
        <span
          className="inline-flex items-center gap-1 text-xs text-slate-500"
          title={
            lastRun.mode === "live"
              ? "Real model calls: prompt output and any LLM-judge scores came from OpenAI."
              : "Offline simulation: no OPENAI_API_KEY configured when this ran."
          }
        >
          {lastRun.mode === "live" ? (
            <Zap size={12} className="text-emerald-600" />
          ) : (
            <ZapOff size={12} className="text-amber-600" />
          )}
          {lastRun.mode === "live" ? "Live" : "Simulated"}
        </span>
        {lastRun.passRate === 1 && (
          <span className="ml-auto text-xs text-amber-700/80">
            100% pass — worth checking the dataset is actually stress-testing anything.
          </span>
        )}
      </div>

      <AssertionRollup spec={spec} run={lastRun} />

      <div className="space-y-2">
        {rows.map((r) => {
          const isOpen = expanded === r.datasetItemId;
          const allPass = r.failCount === 0;
          return (
            <div key={r.datasetItemId} className="rounded-xl border border-slate-200 bg-slate-50">
              <button
                onClick={() => setExpanded(isOpen ? null : r.datasetItemId)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
              >
                {isOpen ? (
                  <ChevronDown size={14} className="shrink-0 text-slate-500" />
                ) : (
                  <ChevronRight size={14} className="shrink-0 text-slate-500" />
                )}
                {allPass ? (
                  <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
                ) : (
                  <XCircle size={14} className="shrink-0 text-rose-600" />
                )}
                <span className="flex-1 truncate text-xs text-slate-700">
                  {r.item ? datasetItemLabel(r.item, variableNames) : ""}
                </span>
                <span className="shrink-0 text-xs text-slate-500">
                  {r.scores.filter((s) => s.passed).length}/{r.scores.length} checks passed
                </span>
              </button>
              {isOpen && (
                <div className="space-y-3 border-t border-slate-200 px-3 py-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Output</p>
                    <p className="mt-1 rounded-lg bg-slate-100 p-2.5 text-xs text-slate-700">{r.output}</p>
                  </div>
                  <div className="space-y-1">
                    {r.scores.map((sc) => (
                      <div key={sc.assertionId} className="flex items-start gap-2 text-xs">
                        {sc.passed ? (
                          <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-600" />
                        ) : (
                          <XCircle size={12} className="mt-0.5 shrink-0 text-rose-600" />
                        )}
                        <span className={sc.passed ? "text-slate-600" : "text-rose-700"}>{sc.reason}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Open-coding note</p>
                    <textarea
                      rows={2}
                      placeholder="What's actually going on here, in your own words…"
                      value={r.note ?? ""}
                      onChange={(e) => setNote(r.datasetItemId, e.target.value)}
                      className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
