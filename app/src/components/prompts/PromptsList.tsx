import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Compass, FileText, Globe2, Link2, Lock, Plus, Rocket, Search, Trash2 } from "lucide-react";
import { useStore } from "../../store";
import { useAssistantActions } from "../../assistantContext";
import { activePromptVersion, draftDiffersFromBase } from "../../promptFactory";
import type { LibraryVisibility } from "../../types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/ui/page-shell";
import { ColumnHeader, UPDATED_AT_PRESET_LABEL, matchesUpdatedAtPreset, type SortDir, type UpdatedAtPreset } from "@/components/ui/column-header";
import { PrivacyFilter, type PrivacyFilterValue } from "@/components/ui/privacy-filter";
import { NewItemFlow } from "../NewItemFlow";

type SortKey = "id" | "name" | "owner" | "access" | "updatedAt" | "apiFetches" | "executions";

interface ColumnFilters {
  id: string;
  name: string;
  owner: Set<string>;
  access: Set<LibraryVisibility>;
  updatedAt: UpdatedAtPreset;
}

/** Chevron, ID, Name/Linked get the flexible space; the rest mirror the Specs table's fixed widths. */
const ROW_COLUMNS = "grid-cols-[22px_100px_minmax(0,1.8fr)_minmax(0,1fr)_minmax(120px,0.8fr)_84px_150px_96px_96px]";

function relativeTime(ts: number): string {
  const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

export function PromptsList() {
  const { prompts, specs, users, currentUserId, createPrompt, deletePrompt, publishPrompt, select, selectPrompt } =
    useStore();
  const { openWithPrompt } = useAssistantActions();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PrivacyFilterValue>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newFlowOpen, setNewFlowOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [openFilterKey, setOpenFilterKey] = useState<SortKey | null>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({
    id: "",
    name: "",
    owner: new Set(),
    access: new Set(),
    updatedAt: "any",
  });

  function ownerOf(id: string) {
    return users.find((u) => u.id === id) ?? { name: "Unknown", initials: "?" };
  }

  function specNameOf(id: string | null) {
    if (!id) return null;
    return specs.find((s) => s.id === id)?.name ?? null;
  }

  /** Spec-linked Prompts borrow their Spec's mocked usage telemetry; standalone ones have none. */
  function usageStatsFor(specId: string | null) {
    if (!specId) return undefined;
    return specs.find((s) => s.id === specId)?.usageStats;
  }

  /** "Type it myself" branch of the New Prompt flow. */
  function handleNewItemManual() {
    const name = window.prompt("Name this Prompt", "New Prompt")?.trim();
    if (!name) return;
    createPrompt(name, currentUserId, "private");
  }

  /**
   * "Ask North Star" branch — always the full Spec+Prompt(+Assertions+Dataset) bundle, so a
   * North-Star-generated Prompt is never left without its Spec.
   */
  function handleNewItemNorthStar() {
    openWithPrompt("Build a new prompt from scratch");
  }

  function openSpec(specId: string) {
    selectPrompt(null);
    select(specId);
  }

  function handleDelete(id: string, name: string) {
    if (window.confirm(`Delete "${name}"? This removes the Prompt and its version history, and can't be undone.`)) {
      deletePrompt(id);
      setExpandedId((current) => (current === id ? null : current));
    }
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "updatedAt" || key === "apiFetches" || key === "executions" ? "desc" : "asc");
    }
  }

  function toggleOwnerFilter(userId: string) {
    setColumnFilters((f) => {
      const next = new Set(f.owner);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return { ...f, owner: next };
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

  const ownerOptions = useMemo(() => {
    const ids = new Set(prompts.map((p) => p.ownerId));
    return users.filter((u) => ids.has(u.id));
  }, [prompts, users]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return prompts
      .filter((p) => p.visibility === "org" || p.ownerId === currentUserId)
      .filter((p) => (filter === "mine" ? p.ownerId === currentUserId : filter === "org" ? p.visibility === "org" : true))
      .filter((p) => !columnFilters.id || p.id.toLowerCase().includes(columnFilters.id.toLowerCase()))
      .filter((p) => !columnFilters.name || p.name.toLowerCase().includes(columnFilters.name.toLowerCase()))
      .filter((p) => columnFilters.owner.size === 0 || columnFilters.owner.has(p.ownerId))
      .filter((p) => columnFilters.access.size === 0 || columnFilters.access.has(p.visibility))
      .filter((p) => matchesUpdatedAtPreset(p.updatedAt, columnFilters.updatedAt))
      .filter((p) => {
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        switch (sortKey) {
          case "id":
            return a.id.localeCompare(b.id) * dir;
          case "name":
            return a.name.localeCompare(b.name) * dir;
          case "owner":
            return ownerOf(a.ownerId).name.localeCompare(ownerOf(b.ownerId).name) * dir;
          case "access":
            return a.visibility.localeCompare(b.visibility) * dir;
          case "apiFetches":
            return ((usageStatsFor(a.specId)?.promptFetches ?? -1) - (usageStatsFor(b.specId)?.promptFetches ?? -1)) * dir;
          case "executions":
            return (
              ((usageStatsFor(a.specId)?.productionExecutions ?? -1) - (usageStatsFor(b.specId)?.productionExecutions ?? -1)) *
              dir
            );
          default:
            return (a.updatedAt - b.updatedAt) * dir;
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompts, specs, currentUserId, filter, query, sortKey, sortDir, columnFilters]);

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <Compass size={16} />
            <span className="text-xs font-semibold uppercase tracking-wider">AI Studio</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Prompts</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Every Spec's Prompt lives here automatically, alongside Prompts you create directly — each with its own
            version history. Click one to open it in the Playground.
          </p>
        </div>
        <Button variant="default" onClick={() => setNewFlowOpen(true)}>
          <Plus size={16} /> New Prompt
        </Button>
      </div>

      <NewItemFlow
        open={newFlowOpen}
        onClose={() => setNewFlowOpen(false)}
        itemLabel="Prompt"
        onManual={handleNewItemManual}
        onNorthStar={handleNewItemNorthStar}
      />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, tag, description…"
            className="pl-8"
          />
        </div>
        <PrivacyFilter value={filter} onChange={setFilter} />
      </div>

      {visible.length === 0 ? (
        <Card className="mt-10 flex flex-col items-center gap-3 px-6 py-16 text-center">
          <FileText className="text-slate-400" size={28} />
          <p className="text-sm text-slate-600">
            {prompts.length === 0 ? "No Prompts yet — create one, or Generate a Prompt inside a Spec." : "Nothing matches these filters."}
          </p>
        </Card>
      ) : (
        <div className="mt-5">
          {openFilterKey && <div className="fixed inset-0 z-20" onClick={() => setOpenFilterKey(null)} />}

          <div
            className={`relative z-10 grid ${ROW_COLUMNS} gap-3 rounded-t-2xl border border-b-0 border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500`}
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
            <span>Linked</span>
            <ColumnHeader
              label="Owner"
              columnKey="owner"
              activeSort={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              filterActive={columnFilters.owner.size > 0}
              isFilterOpen={openFilterKey === "owner"}
              onToggleFilter={setOpenFilterKey}
              filterContent={
                <div className="space-y-1">
                  {ownerOptions.length === 0 && <p className="text-xs text-slate-400">No one yet.</p>}
                  {ownerOptions.map((u) => (
                    <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-xs hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={columnFilters.owner.has(u.id)}
                        onChange={() => toggleOwnerFilter(u.id)}
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
              title="Fetches of this Prompt's linked Spec, in the last 24h. Standalone Prompts have no telemetry source."
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
              title="Production executions of this Prompt's linked Spec, in the last 24h. Standalone Prompts have no telemetry source."
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
          {visible.map((p) => {
            const expanded = expandedId === p.id;
            const owner = ownerOf(p.ownerId);
            const version = activePromptVersion(p);
            const specName = specNameOf(p.specId);
            const hasDraft = draftDiffersFromBase(p);
            const usage = usageStatsFor(p.specId);
            const reversedVersions = [...p.versions].reverse();
            const latestPublishedId = reversedVersions.find((v) => v.status === "published")?.id ?? null;

            return (
              <div key={p.id} className="border-b border-slate-100 last:border-b-0">
                <div className={`grid ${ROW_COLUMNS} items-center gap-3 px-4 py-3 hover:bg-slate-50`}>
                  <button
                    onClick={() => setExpandedId(expanded ? null : p.id)}
                    className="text-slate-500 hover:text-slate-800"
                    title="Show versions"
                  >
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  <button onClick={() => selectPrompt(p.id)} className="min-w-0 text-left">
                    <span className="truncate font-mono text-[11px] text-slate-500" title={p.id}>
                      {p.id}
                    </span>
                  </button>

                  <button onClick={() => selectPrompt(p.id)} className="min-w-0 text-left">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-slate-900 hover:text-primary">{p.name}</span>
                      <Badge tone={version.status === "published" ? "success" : "neutral"}>
                        {version.status === "published" ? "Published" : "Draft"}
                      </Badge>
                      {hasDraft && <Badge tone="warning">Unsaved edits</Badge>}
                    </span>
                    {p.description && <span className="mt-0.5 block truncate text-xs text-slate-400">{p.description}</span>}
                  </button>

                  {specName ? (
                    <button
                      onClick={() => openSpec(p.specId!)}
                      className="flex min-w-0 items-center gap-1.5 text-xs text-primary hover:text-primary"
                      title="Open the linked Spec"
                    >
                      <Link2 size={11} className="shrink-0" />
                      <span className="truncate">{specName}</span>
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">Standalone</span>
                  )}

                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600">
                    <Avatar title={owner.name}>
                      <AvatarFallback>{owner.initials}</AvatarFallback>
                    </Avatar>
                    <span className="truncate" title={owner.name}>{owner.name}</span>
                  </span>

                  <Badge tone={p.visibility === "org" ? "success" : "neutral"}>
                    {p.visibility === "org" ? (
                      <>
                        <Globe2 size={11} /> Public
                      </>
                    ) : (
                      <>
                        <Lock size={11} /> Private
                      </>
                    )}
                  </Badge>

                  <span className="text-xs text-slate-500">{relativeTime(p.updatedAt)}</span>

                  <span className="text-xs tabular-nums text-slate-600">
                    {usage ? usage.promptFetches.toLocaleString() : "—"}
                  </span>
                  <span className="text-xs tabular-nums text-slate-600">
                    {usage ? usage.productionExecutions.toLocaleString() : "—"}
                  </span>
                </div>

                {expanded && (
                  <div className="grid grid-cols-1 gap-6 border-t border-slate-100 bg-slate-50 px-4 py-4 lg:grid-cols-2">
                    <div>
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        Version history
                      </p>
                      <p className="mb-2 text-[11px] text-slate-400">
                        Click any version to open it in the Playground — the latest published version is highlighted.
                      </p>
                      <div className="space-y-1.5">
                        {hasDraft && (
                          <button
                            onClick={() => selectPrompt(p.id)}
                            className="block w-full rounded-lg border border-amber-500/25 bg-amber-50 px-2.5 py-1.5 text-left hover:border-amber-500/50"
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-xs text-slate-700">
                                {p.draft!.model} · temp {p.draft!.temperature}
                              </span>
                              <Badge tone="warning">Unsaved draft</Badge>
                            </span>
                            <span className="mt-0.5 block text-[11px] text-slate-400">{relativeTime(p.draft!.updatedAt)}</span>
                          </button>
                        )}
                        {reversedVersions.map((v) => {
                          const isLatestPublished = v.id === latestPublishedId;
                          return (
                            <button
                              key={v.id}
                              onClick={() => selectPrompt(p.id, v.id)}
                              className={`block w-full rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                                isLatestPublished
                                  ? "border-emerald-400 bg-emerald-50 hover:border-emerald-500"
                                  : v.id === p.activeVersionId
                                    ? "border-slate-300 bg-slate-100 hover:border-slate-400"
                                    : "border-slate-200 bg-slate-50 hover:border-slate-300"
                              }`}
                            >
                              <span className="flex items-center justify-between gap-2">
                                <span className="text-xs text-slate-700">
                                  v{v.version} · {v.model} · temp {v.temperature}
                                </span>
                                <span className="flex shrink-0 items-center gap-1">
                                  {v.status === "published" && (
                                    <Badge tone="success">{isLatestPublished ? "Latest published" : "Published"}</Badge>
                                  )}
                                  {v.id === p.activeVersionId && <Badge tone="accent">Current</Badge>}
                                </span>
                              </span>
                              <span className="mt-0.5 block text-[11px] text-slate-400">{relativeTime(v.createdAt)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-3">
                      {p.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {p.tags.map((t) => (
                            <Badge key={t}>{t}</Badge>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-slate-400">
                        {p.versions.length} version{p.versions.length === 1 ? "" : "s"}
                        {p.specId ? " · edits here also update the linked Spec" : ""}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="secondary" onClick={() => selectPrompt(p.id)}>
                          Open in Playground
                        </Button>
                        {!p.specId && version.status !== "published" && !hasDraft && (
                          <Button size="sm" variant="default" onClick={() => publishPrompt(p.id)}>
                            <Rocket size={13} /> Publish
                          </Button>
                        )}
                        {p.ownerId === currentUserId &&
                          (p.specId ? (
                            <span className="text-[11px] text-slate-400">
                              Linked to a Spec — delete the Spec to remove this Prompt.
                            </span>
                          ) : (
                            <button
                              onClick={() => handleDelete(p.id, p.name)}
                              className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 size={13} /> Delete
                            </button>
                          ))}
                      </div>
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
