import type { ReactNode } from "react";
import { Activity, BarChart3, GitCompare, Link2, ShieldCheck, Wifi } from "lucide-react";
import type { SpecProject } from "../../types";
import { Badge } from "@/components/ui/badge";

interface PlannedCard {
  icon: ReactNode;
  title: string;
  horizon: "Next" | "Later";
  body: string;
}

function cardsFor(spec: SpecProject): PlannedCard[] {
  return [
    {
      icon: <Activity size={16} />,
      title: "Production traces",
      horizon: "Next",
      body:
        `Real production calls to this Prompt (once it's live) will show up here, with one click to turn ` +
        `any trace into a Dataset row — expected output pre-filled. Designed and built as its own track; ` +
        `what this Spec owns is turning a trace into a test case, not the trace viewer itself.`,
    },
    {
      icon: <Wifi size={16} />,
      title: "Online evaluation",
      horizon: "Next",
      body:
        `Bind this Spec's Eval suite to a sample of live traffic so the same checks that gate a release ` +
        `keep running against production afterward — drift shows up as a number moving, not a support ` +
        `ticket. Partly underway already in Prompt Studio; this is where it lands in AI Studio.`,
    },
    {
      icon: <BarChart3 size={16} />,
      title: "Production quality dashboard",
      horizon: "Next",
      body:
        `A real view of this Spec's pass rate, drift, and volume over time, sourced from the traces/online-eval ` +
        `data above${spec.usageStats ? ` (today's API fetches/executions columns are the mocked placeholder for this)` : ""} — not hand-authored numbers.`,
    },
    {
      icon: <GitCompare size={16} />,
      title: "Comparison",
      horizon: "Later",
      body:
        `Side-by-side runs across Prompt versions or models, living here where evals already run — not a ` +
        `separate Compare page — with regression firing automatically on every change.`,
    },
    {
      icon: <ShieldCheck size={16} />,
      title: "Approval & publishing, redesigned",
      horizon: "Later",
      body:
        `The Review tab's checklist gets replaced, not deleted — a human still signs off before release, ` +
        `but looking at real evidence (coverage, regressions, cost) instead of boxes ticked.`,
    },
    {
      icon: <Link2 size={16} />,
      title: "Business outcomes",
      horizon: "Later",
      body: `Connecting this Spec's quality signal to the actual business KPIs it's meant to move, not just internal test scores.`,
    },
  ];
}

export function ObservabilityPane({ spec }: { spec: SpecProject }) {
  const cards = cardsFor(spec);
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">What's next for this Spec</h3>
        <p className="mt-1 text-xs text-slate-500">
          Nothing below is built yet — shown here so the roadmap stays visible next to the Spec it applies to,
          instead of living only in a separate deck. "Next" and "Later" match the shared AI Studio roadmap horizons.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <div key={c.title} className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                <span className="text-slate-400">{c.icon}</span>
                {c.title}
              </span>
              <Badge tone={c.horizon === "Next" ? "info" : "neutral"}>{c.horizon}</Badge>
            </div>
            <p className="text-xs leading-5 text-slate-500">{c.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
