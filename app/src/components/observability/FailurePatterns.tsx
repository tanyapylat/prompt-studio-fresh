import { useState } from "react";
import type { FailurePattern } from "@/monitoring";
import { formatPercent } from "@/monitoring";

interface FailurePatternsProps {
  patterns: FailurePattern[];
  totalGraded: number;
}

/**
 * Failing conversations grouped by *which checks failed together* — a shared signature usually means
 * one root cause, so ten failures can read as two problems instead of ten.
 */
export function FailurePatterns({ patterns, totalGraded }: FailurePatternsProps) {
  const [open, setOpen] = useState<string | null>(null);

  if (patterns.length === 0) {
    return <p className="text-sm text-slate-500">No failing conversations here.</p>;
  }
  const max = patterns[0].count;

  const hasChats = patterns.some((p) => p.chats.length > 0);
  return (
    <div>
      {!hasChats && <p className="mb-2 text-xs text-slate-400">Chat IDs are only kept for the latest 20 runs.</p>}
      <ul className="divide-y divide-slate-100">
      {patterns.map((p) => {
        const key = p.signature.join("|") || "none";
        const expanded = open === key;
        return (
          <li key={key} className="py-3">
            <div className="flex items-start gap-4">
              <div className="w-20 shrink-0">
                <p className="text-lg font-semibold tabular-nums text-slate-900">{p.count}</p>
                <p className="text-[11px] text-slate-400">{formatPercent(p.count / totalGraded, 1)} of graded</p>
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-red-400" style={{ width: `${(p.count / max) * 100}%` }} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.signature.length === 0 ? (
                    <span className="text-xs text-slate-400">No check detail recorded</span>
                  ) : (
                    p.signature.map((s) => (
                      <span key={s} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
                        {s}
                      </span>
                    ))
                  )}
                </div>
                {p.chats.length > 0 && (
                  <button
                    onClick={() => setOpen(expanded ? null : key)}
                    className="mt-2 text-xs text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
                  >
                    {expanded ? "Hide chat IDs" : `Show chat IDs (${p.chats.length})`}
                  </button>
                )}
                {expanded && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.chats.slice(0, 40).map((c, i) => (
                      <span key={`${c}-${i}`} className="rounded border border-slate-200 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">
                        {c}
                      </span>
                    ))}
                    {p.chats.length > 40 && <span className="text-[11px] text-slate-400">+{p.chats.length - 40} more</span>}
                  </div>
                )}
              </div>
            </div>
          </li>
        );
      })}
      </ul>
    </div>
  );
}
