import type { PatternTrend } from "@/monitoring";
import { formatPercent } from "@/monitoring";

const fmtDay = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const w = 96;
  const h = 22;
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${i * step},${h - (v / max) * (h - 2) - 1}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={d} fill="none" stroke="#f87171" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

interface PatternTrendsProps {
  trends: PatternTrend[];
  /** The visible period (ISO). A pattern first seen in its last quarter is marked new. */
  periodStart: string;
  periodEnd: string;
  limit?: number;
}

/** Failure patterns across the whole period: how common, when each first appeared, and its shape over time. */
export function PatternTrends({ trends, periodStart, periodEnd, limit = 8 }: PatternTrendsProps) {
  if (trends.length === 0) return <p className="text-sm text-slate-500">No failing conversations in this period.</p>;
  const shown = trends.slice(0, limit);
  const max = shown[0].total;
  const start = new Date(periodStart).getTime();
  const end = new Date(periodEnd).getTime();
  // Only meaningful over a few days or more; otherwise everything would look new.
  const newAfter = end - start >= 3 * 86_400_000 ? start + 0.75 * (end - start) : Infinity;

  return (
    <div>
      <ul className="divide-y divide-slate-100">
        {shown.map((t) => {
          const isNew = new Date(t.firstSeen).getTime() > newAfter;
          return (
            <li key={t.signature.join("|")} className="flex items-center gap-4 py-2.5">
              <div className="w-20 shrink-0">
                <p className="text-base font-semibold tabular-nums text-slate-900">{t.total}</p>
                <p className="text-[11px] text-slate-400">{formatPercent(t.share, 1)} of graded</p>
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-red-400" style={{ width: `${(t.total / max) * 100}%` }} />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {t.signature.length === 0 ? (
                    <span className="text-xs text-slate-400">No check detail recorded</span>
                  ) : (
                    t.signature.map((s) => (
                      <span key={s} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
                        {s}
                      </span>
                    ))
                  )}
                  {isNew && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">New</span>}
                </div>
              </div>
              <div className="hidden w-28 shrink-0 text-right text-[11px] text-slate-400 sm:block">
                first seen {fmtDay(t.firstSeen)}
                <br />
                last {fmtDay(t.lastSeen)}
              </div>
              <div className="shrink-0">
                <Spark values={t.series} />
              </div>
            </li>
          );
        })}
      </ul>
      {trends.length > limit && <p className="mt-2 text-xs text-slate-400">+{trends.length - limit} rarer patterns not shown</p>}
    </div>
  );
}
