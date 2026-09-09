import { HelpCircle, TrendingUp } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";

const QUESTIONS: { group: string; items: { q: string; body: string }[] }[] = [
  {
    group: "Adoption vs. quality — do they belong together?",
    items: [
      {
        q: "Should this page show tool adoption alongside production quality — or should those be two separate views?",
        body: "Adoption = who's using AI Studio, how many Specs and runs. Quality = how well our live prompts are performing. Same audience or different?",
      },
      {
        q: "Who is the primary audience for this page?",
        body: "Engineering leadership checking if the team is adopting the tool, or prompt owners checking whether their prompts are healthy in production?",
      },
    ],
  },
  {
    group: "Production quality & online evals",
    items: [
      {
        q: "Should production quality live here (org-wide) or inside each individual Spec's workspace — or both?",
        body: "Each Spec already has an Observability tab in its workspace. Does a Dashboard complement that, replace it, or serve a different purpose entirely?",
      },
      {
        q: "When quality drifts, who finds out and how?",
        body: "A passive badge on the Specs home list, or an active notification to the Spec owner? What's the threshold, and who owns it if the original author has left?",
      },
      {
        q: "Do prompt owners get a personal view, or is everything org-wide?",
        body: "A 'my prompts' filter (like the Specs home list already has) vs. one shared org-wide view for everyone.",
      },
    ],
  },
];

export function Dashboard() {
  return (
    <PageShell>
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <TrendingUp size={18} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Open questions for the team — these decisions shape what gets built here and in the Observability section.
          </p>
        </div>
      </div>

      <div className="mt-8 space-y-8">
        {QUESTIONS.map(({ group, items }) => (
          <div key={group}>
            <div className="mb-4 flex items-center gap-2">
              <HelpCircle size={15} className="shrink-0 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-800">{group}</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map(({ q, body }) => (
                <div key={q} className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4">
                  <p className="text-sm font-medium text-slate-800">{q}</p>
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">{body}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
