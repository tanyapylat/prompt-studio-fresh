import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Compass,
  Copy,
  FileText,
  Globe2,
  Lock,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useStore } from "../store";
import { createBlankSpec, forkSpec } from "../specFactory";
import { computeCoverage } from "../coverage";
import { canView, getRole, ROLE_LABEL } from "../permissions";
import { mirrorPromptIdForSpec, versionIdForTarget } from "../promptFactory";
import type { SpecProject } from "../types";
import { Avatar, Badge, Button, Card, PageShell, TextInput } from "./ui";
import { AccessManager } from "./AccessManager";

type MineFilter = "all" | "mine" | "org";
type StatusFilter = "all" | "draft" | "published";
type SortKey = "updated" | "name" | "runs" | "coverage" | "passRate";

const SORT_LABEL: Record<SortKey, string> = {
  updated: "Sort: Recently updated",
  name: "Sort: Name (A–Z)",
  runs: "Sort: Most runs",
  coverage: "Sort: Coverage",
  passRate: "Sort: Pass rate",
};

const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  all: "Any status",
  draft: "Draft",
  published: "Published",
};

function lastPassRate(s: SpecProject): number | null {
  const last = s.runs[s.runs.length - 1];
  return last ? last.passRate : null;
}

function relativeTime(ts: number): string {
  const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

/**
 * Owner/Access hold fixed-size content (avatar + first name, a badge), so they get a floor and only
 * a small share of the slack — extra width goes to Name and Powers, which is where the text lives.
 */
const ROW_COLUMNS =
  "grid-cols-[22px_minmax(0,2.6fr)_minmax(168px,0.9fr)_minmax(124px,0.7fr)_minmax(0,1.3fr)_84px_56px_56px_76px]";

export function Home() {
  const { specs, users, currentUserId, select, addSpec, removeSpec, selectPrompt } = useStore();
  const [filter, setFilter] = useState<MineFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [powerFilter, setPowerFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [forkMenuOpen, setForkMenuOpen] = useState(false);

  function handleCreate() {
    const name = window.prompt("Name this Spec", "New Spec")?.trim();
    addSpec(createBlankSpec(name || "Untitled Spec", currentUserId));
  }

  function handleFork(source: SpecProject) {
    setForkMenuOpen(false);
    const name = window.prompt("Name the new version", `${source.name} (new version)`)?.trim();
    if (name === null) return;
    addSpec(forkSpec(source, currentUserId, name || undefined));
  }

  function handleDelete(spec: SpecProject) {
    if (
      window.confirm(
        `Delete "${spec.name}"? This removes the Spec and its mirrored Prompt, and can't be undone.`,
      )
    ) {
      removeSpec(spec.id);
      setExpandedId((id) => (id === spec.id ? null : id));
    }
  }

  function ownerOf(id: string) {
    return users.find((u) => u.id === id) ?? { name: "Unknown", initials: "?" };
  }

  /** Jumps to the Spec's mirrored Prompt, opened on the PromptVersion for this exact Target. */
  function openPromptVersion(spec: SpecProject, targetId: string) {
    selectPrompt(mirrorPromptIdForSpec(spec.id), versionIdForTarget(targetId));
  }

  const allPowerTags = useMemo(() => {
    const set = new Set<string>();
    specs.forEach((s) => s.powers.forEach((p) => p.confirmed && set.add(p.text)));
    return [...set].sort();
  }, [specs]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return specs
      .filter((s) => canView(s, currentUserId))
      .filter((s) => (filter === "mine" ? s.ownerId === currentUserId : filter === "org" ? s.visibility === "org" : true))
      .filter((s) => {
        if (statusFilter === "all") return true;
        return s.status === statusFilter;
      })
      .filter((s) => !powerFilter || s.powers.some((p) => p.confirmed && p.text === powerFilter))
      .filter((s) => {
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.goal.toLowerCase().includes(q) ||
          s.powers.some((p) => p.text.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        if (sort === "runs") return b.runs.length - a.runs.length;
        if (sort === "coverage") {
          const ca = computeCoverage(a);
          const cb = computeCoverage(b);
          const ra = ca.total ? ca.covered / ca.total : 0;
          const rb = cb.total ? cb.covered / cb.total : 0;
          return rb - ra;
        }
        if (sort === "passRate") {
          const pa = lastPassRate(a) ?? -1;
          const pb = lastPassRate(b) ?? -1;
          return pb - pa;
        }
        return b.updatedAt - a.updatedAt;
      });
  }, [specs, currentUserId, filter, statusFilter, query, sort, powerFilter]);

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sky-600">
            <Compass size={16} />
            <span className="text-xs font-semibold uppercase tracking-wider">Compass</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Specs</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            One Spec is the source of truth that drives a Prompt, its Assertions, its Dataset, and its Eval —
            together, not as separate disconnected files.
          </p>
        </div>
        <div className="relative flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setForkMenuOpen((v) => !v)}>
            <Copy size={16} /> New version from…
          </Button>
          <Button variant="primary" onClick={handleCreate}>
            <Plus size={16} /> New Spec
          </Button>
          {forkMenuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              <p className="border-b border-slate-200 px-3 py-2 text-[11px] text-slate-500">
                Fork a Spec into a fresh draft — content copied, runs and review cleared.
              </p>
              <div className="max-h-64 overflow-y-auto p-1">
                {specs.filter((s) => canView(s, currentUserId)).length === 0 && (
                  <p className="px-3 py-2 text-xs text-slate-400">No Specs to fork yet.</p>
                )}
                {specs
                  .filter((s) => canView(s, currentUserId))
                  .map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleFork(s)}
                      className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-100"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-slate-800">{s.name}</span>
                        <span className="block truncate text-[11px] text-slate-400">{s.goal || "No goal yet"}</span>
                      </span>
                      <Badge tone={s.status === "published" ? "success" : "neutral"}>
                        {s.status === "published" ? "Published" : "Draft"}
                      </Badge>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, id, goal, powers…"
            className="pl-8"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {(["all", "mine", "org"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === f ? "bg-sky-600 text-white" : "text-slate-600 hover:text-slate-800"
              }`}
            >
              {f === "all" ? "All" : f === "mine" ? "Mine" : "Org-wide"}
            </button>
          ))}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 outline-none"
        >
          {(Object.keys(STATUS_FILTER_LABEL) as StatusFilter[]).map((k) => (
            <option key={k} value={k}>
              {STATUS_FILTER_LABEL[k]}
            </option>
          ))}
        </select>
        {allPowerTags.length > 0 && (
          <select
            value={powerFilter}
            onChange={(e) => setPowerFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 outline-none"
          >
            <option value="">All products / features</option>
            {allPowerTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="ml-auto rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 outline-none"
        >
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABEL[k]}
            </option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <Card className="mt-10 flex flex-col items-center gap-3 px-6 py-16 text-center">
          <FileText className="text-slate-400" size={28} />
          <p className="text-sm text-slate-600">
            {specs.length === 0 ? "No Specs yet — create one to get started." : "Nothing matches these filters."}
          </p>
        </Card>
      ) : (
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          <div
            className={`grid ${ROW_COLUMNS} gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500`}
          >
            <span />
            <span>Name</span>
            <span>Owner</span>
            <span>Access</span>
            <span>Powers</span>
            <span>Updated</span>
            <span>Runs</span>
            <span>Pass</span>
            <span>Coverage</span>
          </div>

          {visible.map((s) => {
            const expanded = expandedId === s.id;
            const owner = ownerOf(s.ownerId);
            const coverage = computeCoverage(s);
            const role = getRole(s, currentUserId);
            const confirmedPowers = s.powers.filter((p) => p.confirmed);
            const pass = lastPassRate(s);

            return (
              <div key={s.id} className="border-b border-slate-100 last:border-b-0">
                <div className={`grid ${ROW_COLUMNS} items-center gap-3 px-4 py-3 hover:bg-slate-50`}>
                  <button
                    onClick={() => setExpandedId(expanded ? null : s.id)}
                    className="text-slate-500 hover:text-slate-800"
                    title="Show metadata"
                  >
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  <button onClick={() => select(s.id)} className="min-w-0 text-left">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-slate-900 hover:text-sky-700">{s.name}</span>
                      <Badge tone={s.status === "published" ? "success" : "neutral"}>
                        {s.status === "published" ? "Published" : "Draft"}
                      </Badge>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-400">{s.goal || "No goal written yet."}</span>
                  </button>

                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600">
                    <Avatar name={owner.name} initials={owner.initials} />
                    <span className="truncate" title={owner.name}>{owner.name}</span>
                  </span>

                  <span className="flex flex-wrap items-center gap-1">
                    <Badge tone={s.visibility === "org" ? "success" : "neutral"}>
                      {s.visibility === "org" ? (
                        <>
                          <Globe2 size={11} /> Org
                        </>
                      ) : (
                        <>
                          <Lock size={11} /> Private
                        </>
                      )}
                    </Badge>
                    {role && role !== "owner" && <span className="text-[10px] text-slate-400">{ROLE_LABEL[role]}</span>}
                  </span>

                  <span className="flex flex-wrap gap-1">
                    {confirmedPowers.length === 0 && <span className="text-xs text-slate-400">—</span>}
                    {confirmedPowers.slice(0, 2).map((p) => (
                      <Badge key={p.id} tone="accent">
                        {p.text}
                      </Badge>
                    ))}
                    {confirmedPowers.length > 2 && (
                      <span className="text-[10px] text-slate-400">+{confirmedPowers.length - 2}</span>
                    )}
                  </span>

                  <span className="text-xs text-slate-500">{relativeTime(s.updatedAt)}</span>
                  <span className="text-xs text-slate-500">{s.runs.length}</span>
                  <span
                    className={`text-xs ${
                      pass === null
                        ? "text-slate-400"
                        : pass >= 1
                          ? "text-emerald-600"
                          : pass >= 0.8
                            ? "text-amber-600"
                            : "text-rose-600"
                    }`}
                  >
                    {pass === null ? "—" : `${Math.round(pass * 100)}%`}
                  </span>
                  <span
                    className={`text-xs ${
                      coverage.total > 0 && coverage.covered < coverage.total ? "text-amber-600" : "text-slate-500"
                    }`}
                  >
                    {coverage.covered}/{coverage.total}
                  </span>
                </div>

                {expanded && (
                  <div className="grid grid-cols-1 gap-6 border-t border-slate-100 bg-slate-50 px-4 py-4 lg:grid-cols-3">
                    <div className="space-y-4">
                      <div>
                        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Goal</p>
                        <p className="text-xs text-slate-600">{s.goal || "No goal written yet."}</p>
                        {s.forkedFromName && (
                          <p className="mt-2 text-[11px] text-slate-400">
                            Forked from <span className="text-slate-600">{s.forkedFromName}</span>
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          Prompt version history
                        </p>
                        {!s.target ? (
                          <p className="text-xs text-slate-400">No Prompt generated yet.</p>
                        ) : (
                          <>
                            <p className="mb-2 text-[11px] text-slate-400">
                              Click any version to open it in the Playground.
                            </p>
                            <div className="space-y-1.5">
                              <button
                                onClick={() => openPromptVersion(s, s.target!.id)}
                                className="block w-full rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-left hover:border-slate-400"
                              >
                                <span className="flex items-center justify-between">
                                  <span className="text-xs text-slate-700">
                                    {s.target.model} · temp {s.target.temperature}
                                  </span>
                                  <Badge tone="accent">Current</Badge>
                                </span>
                                <span className="mt-0.5 block text-[11px] text-slate-400">
                                  {s.target.createdAt ? relativeTime(s.target.createdAt) : "—"}
                                </span>
                              </button>
                              {s.promptHistory.map((t) => (
                                <button
                                  key={t.id}
                                  onClick={() => openPromptVersion(s, t.id)}
                                  className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left hover:border-slate-300"
                                >
                                  <span className="text-xs text-slate-600">
                                    {t.model} · temp {t.temperature}
                                  </span>
                                  <span className="mt-0.5 block text-[11px] text-slate-400">
                                    {t.createdAt ? relativeTime(t.createdAt) : "—"}
                                  </span>
                                </button>
                              ))}
                              {s.promptHistory.length === 0 && (
                                <p className="text-[11px] text-slate-400">No earlier versions — this is the first generation.</p>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      {s.powers.length > 0 && (
                        <div>
                          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                            Powers (product / feature)
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {s.powers.map((p) => (
                              <Badge key={p.id} tone={p.confirmed ? "accent" : "warning"}>
                                {p.text}
                                {!p.confirmed && " (suggested)"}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="secondary" onClick={() => handleFork(s)}>
                          <Copy size={13} /> Fork as new version
                        </Button>
                        {role === "owner" && (
                          <button
                            onClick={() => handleDelete(s)}
                            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 size={13} /> Delete Spec
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        Recent runs
                      </p>
                      <p className="mb-2 text-[11px] text-slate-400">
                        Suite launches against this Spec&apos;s current pin. Full Suite versioning lands later —
                        for now, runs are the history.
                      </p>
                      {s.runs.length === 0 ? (
                        <p className="text-xs text-slate-400">No runs yet.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {[...s.runs]
                            .map((r, idx) => ({ r, n: idx + 1 }))
                            .reverse()
                            .slice(0, 5)
                            .map(({ r, n }) => (
                              <div
                                key={r.id}
                                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5"
                              >
                                <span className="min-w-0">
                                  <span className="flex items-center gap-1.5 text-xs text-slate-700">
                                    Run {n}
                                  </span>
                                  <p className="mt-0.5 text-[11px] text-slate-400">
                                    {relativeTime(r.createdAt)} · {r.mode}
                                  </p>
                                </span>
                                <span
                                  className={`shrink-0 text-xs font-medium ${
                                    r.passRate >= 1
                                      ? "text-emerald-600"
                                      : r.passRate >= 0.8
                                        ? "text-amber-600"
                                        : "text-rose-600"
                                  }`}
                                >
                                  {Math.round(r.passRate * 100)}%
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Access</p>
                      <AccessManager spec={s} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
