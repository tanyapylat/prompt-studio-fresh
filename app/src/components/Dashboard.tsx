import { useMemo } from "react";
import { Activity, BookMarked, FlaskConical, Gauge, Sparkles, TrendingUp } from "lucide-react";
import { useStore } from "../store";
import { computeCoverage } from "../coverage";
import type { Library, LibraryKind, SpecProject } from "../types";
import { Avatar, Badge, Card, PageShell } from "./ui";

function relativeTime(ts: number): string {
  const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

const LIBRARY_KINDS: { kind: LibraryKind; label: string }[] = [
  { kind: "assertions", label: "Assertions" },
  { kind: "datasets", label: "Datasets" },
  { kind: "judgePolicies", label: "Judge Policies" },
];

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Gauge }) {
  return (
    <Card className="flex items-center gap-3 px-4 py-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p className="text-lg font-semibold text-slate-900">{value}</p>
        <p className="truncate text-xs text-slate-500">{label}</p>
      </div>
    </Card>
  );
}

function totalLibraryUsage(library: Library): number {
  return LIBRARY_KINDS.reduce((sum, { kind }) => sum + library[kind].reduce((s, e) => s + e.usageCount, 0), 0);
}

export function Dashboard() {
  const { specs, prompts, users, library, select } = useStore();

  const totals = useMemo(() => {
    const published = specs.filter((s) => s.status === "published").length;
    const released = specs.filter((s) => s.released).length;
    const totalRuns = specs.reduce((sum, s) => sum + s.runs.length, 0);
    const avgCoverage = specs.length
      ? specs.reduce((sum, s) => {
          const c = computeCoverage(s);
          return sum + (c.total ? c.covered / c.total : 0);
        }, 0) / specs.length
      : 0;
    return { published, released, totalRuns, avgCoverage };
  }, [specs]);

  const mostUsedSpecs = useMemo(
    () =>
      [...specs]
        .filter((s) => s.runs.length > 0)
        .sort((a, b) => b.runs.length - a.runs.length)
        .slice(0, 5),
    [specs],
  );

  const recentActivity = useMemo(() => [...specs].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8), [specs]);

  const powerLeaderboard = useMemo(() => {
    const counts = new Map<string, number>();
    specs.forEach((s) => s.powers.forEach((p) => p.confirmed && counts.set(p.text, (counts.get(p.text) ?? 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [specs]);

  const mostReusedLibraryEntries = useMemo(() => {
    const all = LIBRARY_KINDS.flatMap(({ kind, label }) => library[kind].map((e) => ({ ...e, kindLabel: label })));
    return all.sort((a, b) => b.usageCount - a.usageCount).slice(0, 6);
  }, [library]);

  function ownerOf(id: string) {
    return users.find((u) => u.id === id) ?? { name: "Unknown", initials: "?" };
  }

  return (
    <PageShell>
      <div className="flex items-center gap-2 text-sky-600">
        <TrendingUp size={16} />
        <span className="text-xs font-semibold uppercase tracking-wider">Company Dashboard</span>
      </div>
      <h1 className="mt-1 text-2xl font-semibold text-slate-900">Usage &amp; adoption</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        Who's using Compass and how — visible to everyone, not just admins, so the whole org can see what's
        getting built and reused.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Total Specs" value={specs.length} icon={Gauge} />
        <StatCard label="Total Prompts" value={prompts.length} icon={Sparkles} />
        <StatCard label="Published" value={totals.published} icon={FlaskConical} />
        <StatCard label="Released" value={totals.released} icon={Activity} />
        <StatCard label="Library entries reused" value={totalLibraryUsage(library)} icon={BookMarked} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-4">
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-slate-900">Most-used Specs</h2>
          <p className="mt-0.5 text-xs text-slate-500">Ranked by number of eval runs.</p>
          <div className="mt-3 space-y-2">
            {mostUsedSpecs.length === 0 && <p className="text-xs text-slate-400">No runs yet.</p>}
            {mostUsedSpecs.map((s: SpecProject) => {
              const owner = ownerOf(s.ownerId);
              return (
                <button
                  key={s.id}
                  onClick={() => select(s.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:border-sky-300 hover:bg-slate-100"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar name={owner.name} initials={owner.initials} />
                    <span className="truncate text-xs text-slate-800">{s.name}</span>
                  </span>
                  <Badge>{s.runs.length} runs</Badge>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold text-slate-900">Most-reused Library entries</h2>
          <p className="mt-0.5 text-xs text-slate-500">Prompts, assertions, datasets, and judge policies pinned into other Specs.</p>
          <div className="mt-3 space-y-2">
            {mostReusedLibraryEntries.length === 0 && <p className="text-xs text-slate-400">Nothing saved to the library yet.</p>}
            {mostReusedLibraryEntries.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <span className="min-w-0 truncate text-xs text-slate-800">
                  {e.name} <span className="text-slate-400">· {e.kindLabel}</span>
                </span>
                <Badge>{e.usageCount} uses</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold text-slate-900">What we're powering</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Confirmed product/feature tags across all Specs — see item 1e, autogenerated then human-reviewed.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {powerLeaderboard.length === 0 && <p className="text-xs text-slate-400">No confirmed product tags yet.</p>}
            {powerLeaderboard.map(([text, count]) => (
              <Badge key={text} tone="accent">
                {text} · {count}
              </Badge>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold text-slate-900">Recent activity</h2>
          <p className="mt-0.5 text-xs text-slate-500">Most recently updated Specs, org-wide.</p>
          <div className="mt-3 space-y-2">
            {recentActivity.map((s) => {
              const owner = ownerOf(s.ownerId);
              return (
                <button
                  key={s.id}
                  onClick={() => select(s.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:border-sky-300 hover:bg-slate-100"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar name={owner.name} initials={owner.initials} />
                    <span className="truncate text-xs text-slate-800">{s.name}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-500">{relativeTime(s.updatedAt)}</span>
                </button>
              );
            })}
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
