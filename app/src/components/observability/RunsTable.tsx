import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { failurePatterns, formatPercent, formatUsd, costPerConversation, healthState, runPassRate, type MonitoringRun } from "@/monitoring";

export interface RunRow {
  configId: string;
  configLabel: string;
  configColor: string;
  /** Index of the run within its config's full history. */
  index: number;
  run: MonitoringRun;
  regression: boolean;
}

interface RunsTableProps {
  rows: RunRow[];
  threshold: number;
  selected: { configId: string; index: number } | null;
  onSelect: (configId: string, index: number) => void;
}

const PAGE_SIZE = 12;
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });

type SortKey = "time" | "pass" | "repeats";
const repeatsOf = (r: MonitoringRun) => r.n - r.uniqueChats;

/**
 * Every run in the selected period, one row each — a drill-down, not the headline. Passing
 * conversations are never listed; the point of a row is "is this run worth opening?".
 */
export function RunsTable({ rows, threshold, selected, onSelect }: RunsTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "time", dir: "desc" });
  const [onlyBelow, setOnlyBelow] = useState(false);
  const [onlyRegressions, setOnlyRegressions] = useState(false);
  const [page, setPage] = useState(0);

  const view = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (onlyRegressions && !r.regression) return false;
      if (onlyBelow && runPassRate(r.run).rate >= threshold) return false;
      return true;
    });
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) =>
      sort.key === "time"
        ? sign * a.run.startedAt.localeCompare(b.run.startedAt)
        : sort.key === "repeats"
          ? sign * (repeatsOf(a.run) - repeatsOf(b.run))
          : sign * (runPassRate(a.run).rate - runPassRate(b.run).rate),
    );
  }, [rows, onlyBelow, onlyRegressions, sort, threshold]);

  const pages = Math.max(1, Math.ceil(view.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const pageRows = view.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    setPage(0);
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "time" || key === "repeats" ? "desc" : "asc" }));
  };
  const SortIcon = sort.dir === "asc" ? ArrowUp : ArrowDown;

  const header = (key: SortKey, label: string) => (
    <button onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-slate-700">
      {label}
      {sort.key === key && <SortIcon size={11} />}
    </button>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-slate-600">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={onlyBelow}
            onChange={(e) => {
              setOnlyBelow(e.target.checked);
              setPage(0);
            }}
          />
          Below {formatPercent(threshold)} only
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={onlyRegressions}
            onChange={(e) => {
              setOnlyRegressions(e.target.checked);
              setPage(0);
            }}
          />
          Regressions only
        </label>
        <span className="ml-auto text-slate-400">
          {view.length} of {rows.length} runs
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-medium uppercase tracking-wide text-slate-400">
              <th className="py-2 pr-3">{header("time", "Run (UTC)")}</th>
              <th className="py-2 pr-3">Judge set</th>
              <th className="py-2 pr-3">{header("pass", "Pass rate")}</th>
              <th className="py-2 pr-3">95% range</th>
              <th className="py-2 pr-3">Failed</th>
              <th className="py-2 pr-3">{header("repeats", "Repeated chats")}</th>
              <th className="py-2 pr-3">Most common failure</th>
              <th className="py-2 pr-3 text-right">Slowest 1 in 20</th>
              <th className="py-2 text-right">Cost / conv.</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-slate-400">
                  No runs match these filters.
                </td>
              </tr>
            )}
            {pageRows.map((r) => {
              const pr = runPassRate(r.run);
              const state = healthState(pr, threshold);
              const top = failurePatterns(r.run)[0];
              const isSelected = selected?.configId === r.configId && selected.index === r.index;
              return (
                <tr
                  key={`${r.configId}-${r.index}`}
                  onClick={() => onSelect(r.configId, r.index)}
                  className={cn("cursor-pointer border-b border-slate-50 hover:bg-slate-50", isSelected && "bg-accent hover:bg-accent")}
                >
                  <td className="py-2 pr-3 tabular-nums text-slate-700">{fmtTime(r.run.startedAt)}</td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block size-2 rounded-full" style={{ background: r.configColor }} />
                      {r.configLabel}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="mr-2 font-medium tabular-nums text-slate-900">{formatPercent(pr.rate)}</span>
                    {r.regression ? (
                      <Badge tone="danger">Regression</Badge>
                    ) : state === "alert" ? (
                      <Badge tone="danger">Alert</Badge>
                    ) : state === "watch" ? (
                      <Badge tone="warning">Watch</Badge>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-slate-400">
                    {formatPercent(pr.low)}–{formatPercent(pr.high)}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {r.run.n - r.run.passed} / {r.run.n}
                  </td>
                  <td className="py-2 pr-3">
                    {repeatsOf(r.run) > 0 ? (
                      <Badge tone="warning" title={`${r.run.repeatedChats} chats sampled more than once; ${r.run.uniqueChats} distinct chats in ${r.run.n} conversations`}>
                        +{repeatsOf(r.run)} repeats
                      </Badge>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="max-w-64 py-2 pr-3">
                    {top ? (
                      <span className="flex items-center gap-1.5">
                        <span className="shrink-0 tabular-nums text-slate-500">{top.count}×</span>
                        <span className="truncate font-mono text-[11px] text-slate-600" title={top.signature.join(", ")}>
                          {top.signature.length ? top.signature.join(", ") : "no detail"}
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.run.timedN > 0 ? `${(r.run.latency.p95 / 1000).toFixed(1)}s` : <span className="text-slate-300">—</span>}</td>
                  <td className="py-2 text-right tabular-nums">
                    {costPerConversation(r.run) != null ? formatUsd(costPerConversation(r.run)!) : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs text-slate-500">
          <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            Previous
          </Button>
          <span className="tabular-nums">
            Page {safePage + 1} of {pages}
          </span>
          <Button variant="outline" size="sm" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
