import { useMemo, useState } from "react";
import {
  ArrowUpRight,
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
import { useAssistantActions } from "../assistantContext";
import { createBlankSpec, forkSpec, isSpecPublished } from "../specFactory";
import { canView, getRole, ROLE_LABEL } from "../permissions";
import { mirrorPromptIdForSpec, versionIdForTarget } from "../promptFactory";
import { saveTab } from "./Workspace";
import type { LibraryVisibility, SpecProject } from "../types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/ui/page-shell";
import { ColumnHeader, UPDATED_AT_PRESET_LABEL, matchesUpdatedAtPreset, type UpdatedAtPreset } from "@/components/ui/column-header";
import { PrivacyFilter, type PrivacyFilterValue } from "@/components/ui/privacy-filter";
import { AccessManager } from "./AccessManager";
import { NewItemFlow } from "./NewItemFlow";

type SortKey = "id" | "name" | "updatedBy" | "access" | "updatedAt" | "apiFetches" | "executions";
type SortDir = "asc" | "desc";

interface ColumnFilters {
  id: string;
  name: string;
  updatedBy: Set<string>;
  access: Set<LibraryVisibility>;
  updatedAt: UpdatedAtPreset;
}

function relativeTime(ts: number): string {
  const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

/** "MM/DD/YYYY, h:mm AM/PM" — the USA date:time convention the table now shows instead of a relative time. */
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
 * ID / Name get the flexible space; Last updated by, Access, and the two usage-metric columns
 * hold fixed-size content (avatar + name, a badge, a number) so they get a floor and only a
 * small share of the slack.
 */
const ROW_COLUMNS = "grid-cols-[22px_108px_minmax(0,2.1fr)_minmax(132px,0.9fr)_92px_164px_108px_108px]";

export function Home() {
  const { specs, users, currentUserId, select, addSpec, removeSpec, selectPrompt } = useStore();
  const { openWithPrompt } = useAssistantActions();
  const [filter, setFilter] = useState<PrivacyFilterValue>("org");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newFlowOpen, setNewFlowOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [openFilterKey, setOpenFilterKey] = useState<SortKey | null>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({
    id: "",
    name: "",
    updatedBy: new Set(),
    access: new Set(),
    updatedAt: "any",
  });

  function handleFork(source: SpecProject) {
    // Create the fork immediately — the workspace header's inline input lets the user
    // rename without a browser-native dialog interrupting the demo flow.
    const forked = forkSpec(source, currentUserId);
    addSpec(forked);
    select(forked.id);
  }

  /** "Type it myself" branch of the New Spec flow — from scratch, or forking a chosen source. */
  function handleNewItemManual(sourceId?: string) {
    const source = sourceId ? specs.find((s) => s.id === sourceId) : null;
    if (source) {
      handleFork(source);
      return;
    }
    // Create immediately with a placeholder name — the workspace header's inline input
    // lets the user rename without a browser-native dialog interrupting the flow.
    const spec = createBlankSpec("Untitled Spec", currentUserId);
    addSpec(spec);
    select(spec.id);
  }

  /** "Ask North Star" branch of the New Spec flow — from scratch, or regenerating a forked source. */
  function handleNewItemNorthStar(sourceId?: string) {
    const source = sourceId ? specs.find((s) => s.id === sourceId) : null;
    if (source) {
      addSpec(forkSpec(source, currentUserId));
      openWithPrompt("Regenerate the Prompt, Assertions, and Dataset for this Spec.");
      return;
    }
    openWithPrompt("Build a new prompt from scratch");
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

  /** Jumps straight into the Spec's Results tab, showing its last eval run. */
  function openLastRunResults(spec: SpecProject) {
    saveTab(spec.id, "results");
    select(spec.id);
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "updatedAt" || key === "apiFetches" || key === "executions" ? "desc" : "asc");
    }
  }

  function toggleUpdatedByFilter(userId: string) {
    setColumnFilters((f) => {
      const next = new Set(f.updatedBy);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return { ...f, updatedBy: next };
    });
  }

  function toggleAccessFilter(v: LibraryVisibility) {
    setColumnFilters((f) => {
      const next = new Set(f.access);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return { ...f, access: next };
    });
  }

  const updatedByOptions = useMemo(() => {
    const ids = new Set(specs.map((s) => s.updatedByUserId));
    return users.filter((u) => ids.has(u.id));
  }, [specs, users]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return specs
      .filter((s) => canView(s, currentUserId))
      .filter((s) => (filter === "mine" ? s.ownerId === currentUserId : filter === "org" ? s.visibility === "org" : true))
      .filter((s) => !columnFilters.id || s.id.toLowerCase().includes(columnFilters.id.toLowerCase()))
      .filter((s) => !columnFilters.name || s.name.toLowerCase().includes(columnFilters.name.toLowerCase()))
      .filter((s) => columnFilters.updatedBy.size === 0 || columnFilters.updatedBy.has(s.updatedByUserId))
      .filter((s) => columnFilters.access.size === 0 || columnFilters.access.has(s.visibility))
      .filter((s) => matchesUpdatedAtPreset(s.updatedAt, columnFilters.updatedAt))
      .filter((s) => {
        if (!q) return true;
        return s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.goal.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        switch (sortKey) {
          case "id":
            return a.id.localeCompare(b.id) * dir;
          case "name":
            return a.name.localeCompare(b.name) * dir;
          case "updatedBy":
            return ownerOf(a.updatedByUserId).name.localeCompare(ownerOf(b.updatedByUserId).name) * dir;
          case "access":
            return a.visibility.localeCompare(b.visibility) * dir;
          case "apiFetches":
            return ((a.usageStats?.promptFetches ?? -1) - (b.usageStats?.promptFetches ?? -1)) * dir;
          case "executions":
            return ((a.usageStats?.productionExecutions ?? -1) - (b.usageStats?.productionExecutions ?? -1)) * dir;
          default:
            return (a.updatedAt - b.updatedAt) * dir;
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specs, currentUserId, filter, query, sortKey, sortDir, columnFilters]);

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <Compass size={16} />
            <span className="text-xs font-semibold uppercase tracking-wider">AI Studio</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Specs</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            One Spec is the source of truth that drives a Prompt, its Assertions, its Dataset, and its Eval —
            together, not as separate disconnected files.
          </p>
        </div>
        <div className="relative flex flex-wrap gap-2">
          <Button variant="default" onClick={() => setNewFlowOpen(true)}>
            <Plus size={16} /> New Spec
          </Button>
        </div>
      </div>

      <NewItemFlow
        open={newFlowOpen}
        onClose={() => setNewFlowOpen(false)}
        itemLabel="Spec"
        showOriginStep
        forkSources={specs
          .filter((s) => canView(s, currentUserId))
          .map((s) => ({ id: s.id, name: s.name, goal: s.goal, published: isSpecPublished(s) }))}
        onManual={handleNewItemManual}
        onNorthStar={handleNewItemNorthStar}
      />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, id, goal…"
            className="pl-8"
          />
        </div>
        <PrivacyFilter value={filter} onChange={setFilter} />
      </div>

      {visible.length === 0 ? (
        <Card className="mt-10 flex flex-col items-center gap-3 px-6 py-16 text-center">
          <FileText className="text-slate-400" size={28} />
          <p className="text-sm text-slate-600">
            {specs.length === 0 ? "No Specs yet — create one to get started." : "Nothing matches these filters."}
          </p>
          {specs.length === 0 && (
            <Button variant="default" onClick={() => setNewFlowOpen(true)}>
              <Plus size={16} /> New Spec
            </Button>
          )}
        </Card>
      ) : (
        <div className="mt-5">
          {openFilterKey && <div className="fixed inset-0 z-20" onClick={() => setOpenFilterKey(null)} />}

          <div
            className={`relative z-10 grid ${ROW_COLUMNS} gap-3 rounded-t-2xl border border-b-0 border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500`}
          >
            <span />
            <ColumnHeader
              label="ID"
              columnKey="id"
              activeSort={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              filterActive={!!columnFilters.id}
              isFilterOpen={openFilterKey === "id"}
              onToggleFilter={setOpenFilterKey}
              filterContent={
                <Input
                  autoFocus
                  value={columnFilters.id}
                  onChange={(e) => setColumnFilters((f) => ({ ...f, id: e.target.value }))}
                  placeholder="Filter by ID…"
                />
              }
            />
            <ColumnHeader
              label="Name"
              columnKey="name"
              activeSort={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              filterActive={!!columnFilters.name}
              isFilterOpen={openFilterKey === "name"}
              onToggleFilter={setOpenFilterKey}
              filterContent={
                <Input
                  autoFocus
                  value={columnFilters.name}
                  onChange={(e) => setColumnFilters((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Filter by name…"
                />
              }
            />
            <ColumnHeader
              label="Last updated by"
              columnKey="updatedBy"
              activeSort={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              filterActive={columnFilters.updatedBy.size > 0}
              isFilterOpen={openFilterKey === "updatedBy"}
              onToggleFilter={setOpenFilterKey}
              filterContent={
                <div className="space-y-1">
                  {updatedByOptions.length === 0 && <p className="text-xs text-slate-400">No one yet.</p>}
                  {updatedByOptions.map((u) => (
                    <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-xs hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={columnFilters.updatedBy.has(u.id)}
                        onChange={() => toggleUpdatedByFilter(u.id)}
                        className="accent-primary"
                      />
                      <Avatar title={u.name}>
                        <AvatarFallback>{u.initials}</AvatarFallback>
                      </Avatar>
                      <span className="truncate">{u.name}</span>
                    </label>
                  ))}
                </div>
              }
            />
            <ColumnHeader
              label="Access"
              columnKey="access"
              activeSort={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              filterActive={columnFilters.access.size > 0}
              isFilterOpen={openFilterKey === "access"}
              onToggleFilter={setOpenFilterKey}
              filterContent={
                <div className="space-y-1">
                  {(["org", "private"] as const).map((v) => (
                    <label key={v} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-xs hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={columnFilters.access.has(v)}
                        onChange={() => toggleAccessFilter(v)}
                        className="accent-primary"
                      />
                      {v === "org" ? <Globe2 size={12} /> : <Lock size={12} />}
                      <span>{v === "org" ? "Public" : "Private"}</span>
                    </label>
                  ))}
                </div>
              }
            />
            <ColumnHeader
              label="Updated"
              columnKey="updatedAt"
              activeSort={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              filterActive={columnFilters.updatedAt !== "any"}
              isFilterOpen={openFilterKey === "updatedAt"}
              onToggleFilter={setOpenFilterKey}
              filterContent={
                <div className="space-y-0.5">
                  {(Object.keys(UPDATED_AT_PRESET_LABEL) as UpdatedAtPreset[]).map((k) => (
                    <button
                      key={k}
                      onClick={() => setColumnFilters((f) => ({ ...f, updatedAt: k }))}
                      className={`block w-full rounded-md px-2 py-1 text-left text-xs ${
                        columnFilters.updatedAt === k ? "bg-accent text-accent-foreground" : "hover:bg-slate-50"
                      }`}
                    >
                      {UPDATED_AT_PRESET_LABEL[k]}
                    </button>
                  ))}
                </div>
              }
            />
            <ColumnHeader
              label="API fetches (24h)"
              title="Prompt versions generated from this Spec, fetched from AI Studio in the last 24h. Mocked for now — will come from real usage telemetry."
              columnKey="apiFetches"
              activeSort={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              filterActive={false}
              isFilterOpen={false}
              onToggleFilter={setOpenFilterKey}
            />
            <ColumnHeader
              label="Executions (24h)"
              title="Linked prompt executions on Production via LiteLLM in the last 24h. Mocked for now — will come from real Dynatrace telemetry."
              columnKey="executions"
              activeSort={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              filterActive={false}
              isFilterOpen={false}
              onToggleFilter={setOpenFilterKey}
            />
          </div>

          <div className="overflow-hidden rounded-b-2xl border border-slate-200">
          {visible.map((s) => {
            const expanded = expandedId === s.id;
            const updatedBy = ownerOf(s.updatedByUserId);
            const role = getRole(s, currentUserId);
            const lastRun = s.runs[s.runs.length - 1] ?? null;

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
                    <span className="truncate font-mono text-[11px] text-slate-500" title={s.id}>
                      {s.id}
                    </span>
                  </button>

                  <button onClick={() => select(s.id)} className="min-w-0 text-left">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-slate-900 hover:text-primary">{s.name}</span>
                      <Badge tone={isSpecPublished(s) ? "success" : "neutral"}>
                        {isSpecPublished(s) ? "Published" : "Draft"}
                      </Badge>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-400">{s.goal || "No goal written yet."}</span>
                  </button>

                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600">
                    <Avatar title={updatedBy.name}>
                      <AvatarFallback>{updatedBy.initials}</AvatarFallback>
                    </Avatar>
                    <span className="truncate" title={updatedBy.name}>{updatedBy.name}</span>
                  </span>

                  <span className="flex flex-wrap items-center gap-1">
                    <Badge tone={s.visibility === "org" ? "success" : "neutral"}>
                      {s.visibility === "org" ? (
                        <>
                          <Globe2 size={11} /> Public
                        </>
                      ) : (
                        <>
                          <Lock size={11} /> Private
                        </>
                      )}
                    </Badge>
                    {role && role !== "owner" && <span className="text-[10px] text-slate-400">{ROLE_LABEL[role]}</span>}
                  </span>

                  <span className="text-xs text-slate-500">{formatUsDateTime(s.updatedAt)}</span>

                  <span className="text-xs tabular-nums text-slate-600">
                    {s.usageStats ? s.usageStats.promptFetches.toLocaleString() : "—"}
                  </span>
                  <span className="text-xs tabular-nums text-slate-600">
                    {s.usageStats ? s.usageStats.productionExecutions.toLocaleString() : "—"}
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
                          Usage &amp; footprint
                        </p>
                        <div className="space-y-1 text-xs text-slate-600">
                          <p>
                            Applied to:{" "}
                            <span className="font-medium text-slate-800">{s.appliedFeature || "Not mapped yet"}</span>
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {s.usageStats
                              ? `See the API fetches / Executions columns for the trailing ${s.usageStats.windowHours}h — illustrative for now, will come from Dynatrace-traced LiteLLM calls.`
                              : "No usage data yet."}
                          </p>
                        </div>
                      </div>

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

                    <div className="space-y-4">
                      <div>
                        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          Linked prompt
                        </p>
                        {!s.target ? (
                          <p className="text-xs text-slate-400">No Prompt generated yet.</p>
                        ) : (
                          <button
                            onClick={() => openPromptVersion(s, s.target!.id)}
                            className="block w-full rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-left hover:border-slate-400"
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-xs text-slate-700">
                                {s.target.model} · temp {s.target.temperature}
                              </span>
                              <span className="flex shrink-0 items-center gap-1 text-[11px] text-primary">
                                Open <ArrowUpRight size={11} />
                              </span>
                            </span>
                            <span className="mt-0.5 block text-[11px] text-slate-400">
                              {s.target.createdAt ? relativeTime(s.target.createdAt) : "—"}
                              {s.target.status === "published" ? " · Published" : " · Draft"}
                            </span>
                          </button>
                        )}
                      </div>

                      <div>
                        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          Last eval run
                        </p>
                        {!lastRun ? (
                          <p className="text-xs text-slate-400">No runs yet.</p>
                        ) : (
                          <button
                            onClick={() => openLastRunResults(s)}
                            className="block w-full rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-left hover:border-slate-400"
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span
                                className={`text-xs font-medium ${
                                  lastRun.passRate >= 1
                                    ? "text-emerald-600"
                                    : lastRun.passRate >= 0.8
                                      ? "text-amber-600"
                                      : "text-rose-600"
                                }`}
                              >
                                {Math.round(lastRun.passRate * 100)}% pass
                              </span>
                              <span className="flex shrink-0 items-center gap-1 text-[11px] text-primary">
                                View results <ArrowUpRight size={11} />
                              </span>
                            </span>
                            <span className="mt-0.5 block text-[11px] text-slate-400">
                              {relativeTime(lastRun.createdAt)}
                              {lastRun.scope === "sample" ? " · sample" : ""}
                            </span>
                          </button>
                        )}
                      </div>
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
        </div>
      )}
    </PageShell>
  );
}
