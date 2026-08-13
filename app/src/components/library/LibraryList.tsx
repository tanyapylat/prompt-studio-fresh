import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Globe2, Lock, Search, Sparkles, Trash2 } from "lucide-react";
import { useStore } from "../../store";
import type {
  AssertionTier,
  LibraryAssertion,
  LibraryDataset,
  LibraryJudgePolicy,
  LibraryKind,
} from "../../types";
import { modeLabel } from "../../assertionCatalog";
import { searchLibraryEntries, type AnyLibraryEntry, type AssertionTierFilter } from "../../librarySearch";
import { Avatar, Badge, PageShell, TextInput } from "../ui";

type MineFilter = "all" | "mine" | "org";

const KIND_META: Record<LibraryKind, { title: string; empty: string }> = {
  assertions: { title: "Assertions", empty: "No assertions saved to the library yet." },
  datasets: { title: "Datasets", empty: "No datasets saved to the library yet." },
  judgePolicies: { title: "Judge Policies", empty: "No judge policies saved to the library yet." },
};

const TIER_META: Record<AssertionTier, { label: string; tone: "info" | "warning" | "accent" }> = {
  deterministic: { label: "Deterministic", tone: "info" },
  custom_code: { label: "Custom code", tone: "warning" },
  rubric_grading: { label: "LLM judge", tone: "accent" },
};

const TIER_FILTERS: AssertionTierFilter[] = ["all", "deterministic", "custom_code", "rubric_grading"];

/**
 * Explicit widths rather than `auto` — each row is its own grid, so content-sized columns would
 * size independently per row and never line up with the header.
 */
const ROW_COLUMNS = "grid-cols-[minmax(0,1fr)_104px_176px_104px_56px]";

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
  if (kind === "datasets") {
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
  const e = entry as LibraryJudgePolicy;
  return (
    <div className="space-y-2 text-xs text-slate-700">
      <p>Model: {e.model}</p>
      {e.temperature !== undefined && <p>Temperature: {e.temperature}</p>}
      {e.systemPrompt && (
        <div>
          <p className="mb-1 text-slate-500">Grading instructions</p>
          <p className="rounded-lg border border-slate-200 bg-slate-100 p-3 text-slate-700">{e.systemPrompt}</p>
        </div>
      )}
    </div>
  );
}

export function LibraryList({ kind }: { kind: LibraryKind }) {
  const { library, users, specs, currentUserId, select, setLibraryVisibility, deleteLibraryEntry } = useStore();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MineFilter>("all");
  const [tierFilter, setTierFilter] = useState<AssertionTierFilter>("all");
  const [semantic, setSemantic] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [usedInOpenId, setUsedInOpenId] = useState<string | null>(null);

  const entries = library[kind] as AnyLibraryEntry[];
  const meta = KIND_META[kind];

  const visible = useMemo(() => {
    const scoped = entries
      .filter((e) => e.visibility === "org" || e.ownerId === currentUserId)
      .filter((e) => (filter === "mine" ? e.ownerId === currentUserId : filter === "org" ? e.visibility === "org" : true));
    const searched = searchLibraryEntries(kind, scoped, {
      query,
      mode: semantic ? "semantic" : "keyword",
      tier: kind === "assertions" ? tierFilter : undefined,
    });
    // Semantic search already returns results ranked by relevance — keep that order; otherwise sort by recency.
    return query.trim() && semantic ? searched : [...searched].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [entries, currentUserId, filter, query, semantic, tierFilter, kind]);

  function ownerName(id: string) {
    return users.find((u) => u.id === id) ?? { name: "Unknown", initials: "?" };
  }

  function specName(id: string) {
    return specs.find((s) => s.id === id)?.name ?? "Deleted Spec";
  }

  return (
    <PageShell>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{meta.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Org-wide catalog — save one from inside a Spec's workspace, then pin it back into any other Spec.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <TextInput
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
            semantic ? "border-sky-500 bg-sky-50 text-sky-700" : "border-slate-200 text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Sparkles size={13} /> Semantic
        </button>
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
        {kind === "assertions" && (
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {TIER_FILTERS.map((t) => (
              <button
                key={t}
                onClick={() => setTierFilter(t)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  tierFilter === t ? "bg-sky-600 text-white" : "text-slate-600 hover:text-slate-800"
                }`}
              >
                {t === "all" ? "All types" : TIER_META[t].label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
        <div
          className={`grid ${ROW_COLUMNS} gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500`}
        >
          <span>Name</span>
          <span>Visibility</span>
          <span>Owner</span>
          <span>Updated</span>
          <span>Uses</span>
        </div>

        {visible.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            {query.trim() ? "No matches for this search." : meta.empty}
          </p>
        )}

        {visible.map((entry) => {
          const owner = ownerName(entry.ownerId);
          const expanded = expandedId === entry.id;
          const isMine = entry.ownerId === currentUserId;
          const usedInOpen = usedInOpenId === entry.id;
          return (
            <div key={entry.id} className="border-b border-slate-100 last:border-b-0">
              <button
                onClick={() => setExpandedId(expanded ? null : entry.id)}
                className={`grid w-full ${ROW_COLUMNS} items-center gap-3 px-4 py-3 text-left hover:bg-slate-50`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {expanded ? (
                    <ChevronDown size={14} className="shrink-0 text-slate-500" />
                  ) : (
                    <ChevronRight size={14} className="shrink-0 text-slate-500" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-900">{entry.name}</span>
                    {entry.description && (
                      <span className="mt-0.5 block truncate text-xs text-slate-400">{entry.description}</span>
                    )}
                  </span>
                </span>
                <Badge tone={entry.visibility === "org" ? "success" : "neutral"}>
                  {entry.visibility === "org" ? (
                    <>
                      <Globe2 size={11} /> Org
                    </>
                  ) : (
                    <>
                      <Lock size={11} /> Private
                    </>
                  )}
                </Badge>
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600">
                  <Avatar name={owner.name} initials={owner.initials} />
                  <span className="truncate" title={owner.name}>{owner.name}</span>
                </span>
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
                            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-sky-700 hover:bg-slate-100"
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
                  {entry.description && <p className="text-xs text-slate-600">{entry.description}</p>}
                  {entry.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {entry.tags.map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                    </div>
                  )}
                  <DetailBody kind={kind} entry={entry} />
                  {isMine && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() =>
                          setLibraryVisibility(kind, entry.id, entry.visibility === "org" ? "private" : "org")
                        }
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
                      >
                        Make {entry.visibility === "org" ? "Private" : "Org-wide"}
                      </button>
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
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}
