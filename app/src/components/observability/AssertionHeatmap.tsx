import { cn } from "@/lib/utils";
import type { DayBucket, MonitoringAssertion } from "@/monitoring";
import { assertionPassRate, formatPercent } from "@/monitoring";

/** Pass-rate → cell colour. Deliberately coarse so the eye finds the red cells first. */
function cellClass(rate: number): string {
  if (rate >= 0.97) return "bg-emerald-100 text-emerald-800";
  if (rate >= 0.9) return "bg-emerald-50 text-emerald-700";
  if (rate >= 0.8) return "bg-amber-100 text-amber-800";
  if (rate >= 0.6) return "bg-orange-200 text-orange-900";
  return "bg-red-200 text-red-900";
}

const dayLabel = (t: number) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

interface AssertionHeatmapProps {
  assertions: MonitoringAssertion[];
  /** One column per day — a day of runs pooled together. */
  days: DayBucket[];
  selected: string | null;
  onSelect: (check: string) => void;
}

/** One row per check, one column per day: which checks are failing, and when it started. */
export function AssertionHeatmap({ assertions, days, selected, onSelect }: AssertionHeatmapProps) {
  // Worst over the whole period first, so problems sit at the top.
  const rows = assertions
    .map((a) => {
      const failed = days.reduce((s, d) => s + (d.pooled.failedByCheck[a.name] ?? 0), 0);
      const n = days.reduce((s, d) => s + d.pooled.n, 0);
      return { a, rate: n === 0 ? 1 : 1 - failed / n };
    })
    .sort((p, q) => p.rate - q.rate);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="w-48 text-left font-medium text-slate-400">Check</th>
            {days.map((d) => (
              <th key={d.day} className="min-w-9 text-center text-[10px] font-normal text-slate-400">
                {days.length > 16 ? dayLabel(d.t).replace(/^\w+ /, "") : dayLabel(d.t)}
              </th>
            ))}
            <th className="w-12 text-center text-[10px] font-medium text-slate-400">Period</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ a, rate }) => (
            <tr key={a.name}>
              <td className="pr-2">
                <button
                  onClick={() => onSelect(a.name)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left hover:bg-slate-50",
                    selected === a.name && "bg-accent",
                  )}
                >
                  <span title={a.name} className="truncate font-mono text-[11px] text-slate-700">
                    {a.name}
                  </span>
                  <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                    {a.kind === "judge" ? "AI judge" : "Rule"}
                  </span>
                </button>
              </td>
              {days.map((d) => {
                const pr = assertionPassRate(d.pooled, a.name);
                return (
                  <td
                    key={d.day}
                    title={`${a.name} — ${dayLabel(d.t)}: ${pr.total - pr.passed} of ${pr.total} failed`}
                    className={cn("rounded text-center font-medium tabular-nums", cellClass(pr.rate))}
                  >
                    <div className="py-1 text-[11px]">{days.length > 16 ? Math.round(pr.rate * 100) : formatPercent(pr.rate)}</div>
                  </td>
                );
              })}
              <td className={cn("rounded text-center font-semibold tabular-nums", cellClass(rate))}>
                <div className="py-1 text-[11px]">{formatPercent(rate, 1)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
