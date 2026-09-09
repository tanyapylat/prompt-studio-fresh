import { Activity } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";

export function ObservabilityPage() {
  return (
    <PageShell>
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Activity size={18} />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">Observability</h1>
            <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Coming soon
            </span>
          </div>
          <p className="mt-2 max-w-xl text-sm text-slate-500">
            Production quality, drift, and volume for every Prompt — sourced from real traces and
            online evals. This is where the mocked API fetches and Executions columns on the Specs
            home list become something you can actually act on.
          </p>
        </div>
      </div>
    </PageShell>
  );
}
