import { useEffect, useState } from "react";
import { ArrowUpRight, History } from "lucide-react";
import type { SpecProject } from "../../types";
import { RunDetailBody } from "../results/RunDetailBody";

/** "MM/DD/YYYY, h:mm AM/PM" — matches the format used elsewhere in the app (e.g. Home.tsx's Updated column). */
function formatUsDateTime(ts: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(ts);
}

/**
 * The Results tab: shows one Run — defaults to the latest, but a run-history picker lets you look
 * at any prior Run for this Spec without leaving the Workspace. "View full history" jumps to the
 * standalone Run Detail page (reachable from the sidebar's Runs section) for the same run, which
 * is where cross-Spec browsing and a full-page layout live.
 */
export function ResultsPane({
  spec,
  onRunSample,
  sampleRunBusy,
}: {
  spec: SpecProject;
  onRunSample: (itemIds: string[]) => void;
  sampleRunBusy: boolean;
}) {
  const lastRun = spec.runs[spec.runs.length - 1] ?? null;
  const [selectedRunId, setSelectedRunId] = useState<string | null>(lastRun?.id ?? null);

  // Whenever a new Run lands (or we switch Specs), snap back to the latest — otherwise re-running
  // a sample would silently leave the reviewer staring at a now-stale older Run.
  useEffect(() => {
    setSelectedRunId(lastRun?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.id, lastRun?.id]);

  if (!lastRun) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">Results</h3>
        <p className="text-sm text-slate-500">
          No run yet — try a sample from the Dataset tab, or ask North Star to run the eval suite.
        </p>
      </div>
    );
  }

  const run = spec.runs.find((r) => r.id === selectedRunId) ?? lastRun;
  const isLatest = run.id === lastRun.id;
  const history = [...spec.runs].reverse(); // newest first in the picker

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Results</h3>
        {spec.runs.length > 1 && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <History size={13} className="text-slate-400" />
            <select
              value={run.id}
              onChange={(e) => setSelectedRunId(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-700 outline-none focus:border-ring"
            >
              {history.map((r, i) => (
                <option key={r.id} value={r.id}>
                  {i === 0 ? "Latest" : `${history.length - i} runs ago`} — {formatUsDateTime(r.createdAt)} — {Math.round(r.passRate * 100)}% pass
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <RunDetailBody
        spec={spec}
        run={run}
        onRunSample={isLatest ? onRunSample : undefined}
        sampleRunBusy={sampleRunBusy}
        toolbarEnd={
          <button
            onClick={() => window.open(`/runs/${run.id}`, "_blank")}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-primary hover:underline"
            title="Open this run on its own full-page view (new tab), alongside every other run across every Spec"
          >
            View full history <ArrowUpRight size={11} />
          </button>
        }
      />
    </div>
  );
}
