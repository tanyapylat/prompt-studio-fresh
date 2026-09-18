import { useMemo, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, ChevronRight, Globe2, Lock, Pencil, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { useStore } from "../../store";
import type { AssertionTier, LibraryAssertion, LibraryDataset, LibraryKind, LibraryVisibility } from "../../types";
import { modeLabel } from "../../assertionCatalog";
import { searchLibraryEntries, type AnyLibraryEntry, type AssertionTierFilter } from "../../librarySearch";
import { canMakeAssertionPublic, createLibraryAssertion, createLibraryDataset } from "../../libraryFactory";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageShell } from "@/components/ui/page-shell";
import { ColumnHeader, UPDATED_AT_PRESET_LABEL, matchesUpdatedAtPreset, type SortDir, type UpdatedAtPreset } from "@/components/ui/column-header";
import { PrivacyFilter, type PrivacyFilterValue } from "@/components/ui/privacy-filter";
import { NewAssertionModal } from "./NewAssertionModal";
import { NewDatasetModal } from "./NewDatasetModal";

type SortKey = "id" | "name" | "owner" | "access" | "updatedAt";

interface ColumnFilters {
  id: string;
  name: string;
  owner: Set<string>;
  access: Set<LibraryVisibility>;
  updatedAt: UpdatedAtPreset;
}

interface RubricEditDraft {
  name: string;
  rubric: string;
  passThreshold: string;
}

const KIND_META: Record<LibraryKind, { title: string; empty: string; newLabel: string }> = {
  assertions: { title: "Assertions", empty: "No assertions saved to the library yet.", newLabel: "New Assertion" },
  datasets: { title: "Datasets", empty: "No datasets saved to the library yet.", newLabel: "New Dataset" },
};

const TIER_META: Record<AssertionTier, { label: string; tone: "success" | "warning" | "info" }> = {
  deterministic: { label: "Deterministic", tone: "success" },
  custom_code: { label: "Custom code", tone: "warning" },
  rubric_grading: { label: "LLM judge", tone: "info" },
};

const TIER_FILTERS: AssertionTierFilter[] = ["all", "deterministic", "custom_code", "rubric_grading"];

/**
 * ID/Name get the flexible space; Owner, Access, Updated, and Uses hold fixed-size content, same
 * proportions as the Specs table so the two lists feel like one consistent pattern.
 */
const ROW_COLUMNS = "grid-cols-[22px_92px_minmax(0,1.6fr)_minmax(120px,0.9fr)_88px_140px_56px]";

function relativeTime(ts: number): string {
  const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function DetailBody({ kind, entry }: { kind: LibraryKind; entry: AnyLibraryEntry }) {
  if (kind === "assertions") {
    const e = entry as LibraryAssertion;
    const meta = TIER_META[e.tier];
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {e.group && <Badge>{e.group}</Badge>}
          {e.passThreshold !== undefined && <Badge>{Math.round(e.passThreshold * 100)}% pass threshold</Badge>}
        </div>
        {e.tier === "deterministic" && e.check && (
          <p className="rounded-lg border border-slate-200 bg-slate-100 p-3 text-xs text-slate-700">
            {e.description} <span className="text-slate-500">({modeLabel(e.check.mode)}</span>
            {e.check.value ? `: "${e.check.value}"` : ""}
            {e.check.reference ? `, ref: "${e.check.reference}"` : ""}
            {e.check.threshold !== undefined ? `, threshold: ${e.check.threshold}` : ""}
            <span className="text-slate-500">)</span>
          </p>
        )}
        {e.tier === "custom_code" && (
          <div className="space-y-1">
            <p className="text-xs text-slate-500">{e.codeLanguage ?? "javascript"}</p>
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-100 p-3 font-mono text-xs text-slate-700">
              {e.code}
            </pre>
          </div>
        )}
        {e.tier === "rubric_grading" && (
          <p className="rounded-lg border border-slate-200 bg-slate-100 p-3 text-xs text-slate-700">{e.rubric ?? e.description}</p>
        )}
      </div>
    );
  }
  const e = entry as LibraryDataset;
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-slate-500">{e.items.length} rows</p>
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {e.items.map((it) => (
          <p key={it.id} className="truncate rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700">
            {it.input}
          </p>
        ))}
      </div>
    </div>
  );
}

export function LibraryList({ kind }: { kind: LibraryKind }) {
  const {
    library,
    users,
    specs,
    currentUserId,
    select,
    selectLibraryDataset,
    saveToLibrary,
    setLibraryVisibility,
    updateLibraryEntry,
    deleteLibraryEntry,
  } = useStore();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PrivacyFilterValue>("all");
  const [tierFilter, setTierFilter] = useState<AssertionTierFilter>("all");
  const [semantic, setSemantic] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [usedInOpenId, setUsedInOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<RubricEditDraft | null>(null);
  const [newAssertionOpen, setNewAssertionOpen] = useState(false);
  const [newDatasetOpen, setNewDatasetOpen] = useState(false);
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

  const entries = library[kind] as AnyLibraryEntry[];
  const meta = KIND_META[kind];
  const isDatasetKind = kind === "datasets";

  function ownerName(id: string) {
    return users.find((u) => u.id === id) ?? { name: "Unknown", initials: "?" };
  }

  function specName(id: string) {
    return specs.find((s) => s.id === id)?.name ?? "Deleted Spec";
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "updatedAt" ? "desc" : "asc");
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
    const ids = new Set(entries.map((e) => e.ownerId));
    return users.filter((u) => ids.has(u.id));
  }, [entries, users]);

  const visible = useMemo(() => {
    const scoped = entries
      .filter((e) => e.visibility === "org" || e.ownerId === currentUserId)
      .filter((e) => (filter === "mine" ? e.ownerId === currentUserId : filter === "org" ? e.visibility === "org" : true))
      .filter((e) => !columnFilters.id || e.id.toLowerCase().includes(columnFilters.id.toLowerCase()))
      .filter((e) => !columnFilters.name || e.name.toLowerCase().includes(columnFilters.name.toLowerCase()))
      .filter((e) => columnFilters.owner.size === 0 || columnFilters.owner.has(e.ownerId))
      .filter((e) => columnFilters.access.size === 0 || columnFilters.access.has(e.visibility))
      .filter((e) => matchesUpdatedAtPreset(e.updatedAt, columnFilters.updatedAt));
    const searched = searchLibraryEntries(kind, scoped, {
      query,
      mode: semantic ? "semantic" : "keyword",
      tier: kind === "assertions" ? tierFilter : undefined,
    });
    // Semantic search already returns results ranked by relevance — keep that order; otherwise apply the column sort.
    if (query.trim() && semantic) return searched;
    return [...searched].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "id":
          return a.id.localeCompare(b.id) * dir;
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "owner":
          return ownerName(a.ownerId).name.localeCompare(ownerName(b.ownerId).name) * dir;
        case "access":
          return a.visibility.localeCompare(b.visibility) * dir;
        default:
          return (a.updatedAt - b.updatedAt) * dir;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, currentUserId, filter, query, semantic, tierFilter, kind, columnFilters, sortKey, sortDir]);

  function handleRowClick(entry: AnyLibraryEntry) {
    if (isDatasetKind) {
      selectLibraryDataset(entry.id);
      return;
    }
    setExpandedId((cur) => (cur === entry.id ? null : entry.id));
    setEditingId(null);
  }

  function startEditRubric(entry: LibraryAssertion) {
    setEditingId(entry.id);
    setEditDraft({
      name: entry.name,
      rubric: entry.rubric ?? entry.description,
      passThreshold: entry.passThreshold !== undefined ? String(Math.round(entry.passThreshold * 100)) : "",
    });
  }

  function saveEditRubric(entry: LibraryAssertion) {
    if (!editDraft) return;
    const name = editDraft.name.trim() || entry.name;
    const rubric = editDraft.rubric.trim();
    const pct = editDraft.passThreshold.trim();
    const passThreshold = pct ? Math.min(1, Math.max(0, Number(pct) / 100)) : undefined;
    updateLibraryEntry("assertions", entry.id, (e) => ({
      ...e,
      name,
      description: rubric || (e as LibraryAssertion).description,
      rubric,
      passThreshold,
      updatedAt: Date.now(),
    }));
    setEditingId(null);
    setEditDraft(null);
  }

  function handleNewAssertion(tier: AssertionTier, name: string) {
    saveToLibrary("assertions", createLibraryAssertion(tier, name, currentUserId));
  }

  function handleNewDataset(name: string, fields: string[]) {
    const created = createLibraryDataset(name, currentUserId, fields);
    saveToLibrary("datasets", created);
    selectLibraryDataset(created.id);
  }

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{meta.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Public catalog — save one from inside a Spec's workspace, or add a new private one here directly.
          </p>
        </div>
        {kind === "assertions" && (
          <Button variant="default" onClick={() => setNewAssertionOpen(true)}>
            <Plus size={16} /> New Assertion
          </Button>
        )}
        {isDatasetKind && (
          <Button variant="default" onClick={() => setNewDatasetOpen(true)}>
            <Plus size={16} /> New Dataset
          </Button>
        )}
      </div>

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
        <button
          onClick={() => setSemantic((s) => !s)}
          title="Heuristic local search over synonyms/related terms — not an embeddings API call."
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            semantic ? "border-primary bg-accent text-accent-foreground" : "border-slate-200 text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Sparkles size={13} /> Semantic
        </button>
        <PrivacyFilter value={filter} onChange={setFilter} />
        {kind === "assertions" && (
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {TIER_FILTERS.map((t) => (
              <button
                key={t}
                onClick={() => setTierFilter(t)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  tierFilter === t ? "bg-primary text-primary-foreground" : "text-slate-600 hover:text-slate-800"
                }`}
              >
                {t === "all" ? "All types" : TIER_META[t].label}
              </button>
            ))}
          </div>
        )}
      </div>

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
          <span>Uses</span>
        </div>

        <div className="overflow-hidden rounded-b-2xl border border-slate-200">
          {visible.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              {query.trim() ? "No matches for this search." : meta.empty}
            </p>
          )}

          {visible.map((entry) => {
            const owner = ownerName(entry.ownerId);
            const expanded = !isDatasetKind && expandedId === entry.id;
            const isMine = entry.ownerId === currentUserId;
            const usedInOpen = usedInOpenId === entry.id;
            const isRubric = kind === "assertions" && (entry as LibraryAssertion).tier === "rubric_grading";
            const canGoPublic = kind !== "assertions" || canMakeAssertionPublic(entry as LibraryAssertion);
            const isEditing = editingId === entry.id;

            return (
              <div key={entry.id} className="border-b border-slate-100 last:border-b-0">
                <button
                  onClick={() => handleRowClick(entry)}
                  className={`grid w-full ${ROW_COLUMNS} items-center gap-3 px-4 py-3 text-left hover:bg-slate-50`}
                >
                  <span className="flex shrink-0 items-center text-slate-500">
                    {isDatasetKind ? (
                      <ArrowUpRight size={14} />
                    ) : expanded ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                  </span>
                  <span className="truncate font-mono text-[11px] text-slate-500" title={entry.id}>
                    {entry.id}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-900">{entry.name}</span>
                    {entry.description && (
                      <span className="mt-0.5 block truncate text-xs text-slate-400">{entry.description}</span>
                    )}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600">
                    <Avatar title={owner.name}>
                      <AvatarFallback>{owner.initials}</AvatarFallback>
                    </Avatar>
                    <span className="truncate" title={owner.name}>{owner.name}</span>
                  </span>
                  <Badge tone={entry.visibility === "org" ? "success" : "neutral"}>
                    {entry.visibility === "org" ? (
                      <>
                        <Globe2 size={11} /> Public
                      </>
                    ) : (
                      <>
                        <Lock size={11} /> Private
                      </>
                    )}
                  </Badge>
                  <span className="text-xs text-slate-500">{relativeTime(entry.updatedAt)}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setUsedInOpenId(usedInOpen ? null : entry.id);
                    }}
                    className="text-xs text-slate-500 underline decoration-dotted underline-offset-2 hover:text-slate-700"
                  >
                    {entry.usageCount}
                  </span>
                </button>
                {usedInOpen && (
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                    {entry.usedInSpecIds.length === 0 ? (
                      <p className="text-xs text-slate-500">Not pinned into any Spec yet.</p>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">
                          Used in {entry.usedInSpecIds.length} Spec{entry.usedInSpecIds.length === 1 ? "" : "s"}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {entry.usedInSpecIds.map((specId) => (
                            <button
                              key={specId}
                              onClick={() => select(specId)}
                              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-primary hover:bg-slate-100"
                            >
                              {specName(specId)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {expanded && (
                  <div className="space-y-3 border-t border-slate-100 bg-slate-50 px-4 py-4">
                    {isEditing && editDraft ? (
                      <div className="space-y-2.5">
                        <div>
                          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Name</label>
                          <Input value={editDraft.name} onChange={(e) => setEditDraft((d) => (d ? { ...d, name: e.target.value } : d))} />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Rubric</label>
                          <Textarea
                            rows={4}
                            value={editDraft.rubric}
                            onChange={(e) => setEditDraft((d) => (d ? { ...d, rubric: e.target.value } : d))}
                          />
                        </div>
                        <div className="w-40">
                          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                            Pass threshold (%)
                          </label>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={editDraft.passThreshold}
                            onChange={(e) => setEditDraft((d) => (d ? { ...d, passThreshold: e.target.value } : d))}
                            placeholder="Default"
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <Button size="sm" variant="default" onClick={() => saveEditRubric(entry as LibraryAssertion)}>
                            <Check size={13} /> Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingId(null);
                              setEditDraft(null);
                            }}
                          >
                            <X size={13} /> Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {entry.description && <p className="text-xs text-slate-600">{entry.description}</p>}
                        {entry.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {entry.tags.map((t) => (
                              <Badge key={t}>{t}</Badge>
                            ))}
                          </div>
                        )}
                        <DetailBody kind={kind} entry={entry} />
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {isMine && isRubric && (
                            <Button size="sm" variant="secondary" onClick={() => startEditRubric(entry as LibraryAssertion)}>
                              <Pencil size={13} /> Edit
                            </Button>
                          )}
                          {kind === "assertions" && !isRubric && (
                            <span
                              className="text-[11px] text-slate-400"
                              title="Deterministic checks and custom code are defined by engineers — view-only in the library."
                            >
                              View-only — defined by engineers
                            </span>
                          )}
                          {isMine && (
                            <>
                              {canGoPublic || entry.visibility === "org" ? (
                                <button
                                  onClick={() =>
                                    setLibraryVisibility(kind, entry.id, entry.visibility === "org" ? "private" : "org")
                                  }
                                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
                                >
                                  Make {entry.visibility === "org" ? "Private" : "Public"}
                                </button>
                              ) : (
                                <span
                                  className="text-[11px] text-slate-400"
                                  title="Deterministic checks and custom code can't be made public until an engineer verifies them."
                                >
                                  Private only (not yet verified)
                                </span>
                              )}
                              <button
                                onClick={() => {
                                  if (window.confirm(`Delete "${entry.name}" from the library?`)) {
                                    deleteLibraryEntry(kind, entry.id);
                                    setExpandedId(null);
                                  }
                                }}
                                className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50"
                              >
                                <Trash2 size={12} /> Delete
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {newAssertionOpen && <NewAssertionModal onCreate={handleNewAssertion} onClose={() => setNewAssertionOpen(false)} />}
      {newDatasetOpen && <NewDatasetModal onCreate={handleNewDataset} onClose={() => setNewDatasetOpen(false)} />}
    </PageShell>
  );
}
