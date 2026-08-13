import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Compass, FileText, Globe2, Link2, Lock, Plus, Search, Trash2 } from "lucide-react";
import { useStore } from "../../store";
import { activePromptVersion, draftDiffersFromBase } from "../../promptFactory";
import { Avatar, Badge, Button, Card, PageShell, TextInput } from "../ui";

type MineFilter = "all" | "mine" | "org";
type LinkFilter = "all" | "linked" | "standalone";
type StatusFilter = "all" | "draft" | "published";
type SortKey = "updated" | "name" | "versions";

const LINK_FILTER_LABEL: Record<LinkFilter, string> = {
  all: "Linked or standalone",
  linked: "Linked to Spec",
  standalone: "Standalone",
};

const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  all: "Any status",
  draft: "Draft",
  published: "Published",
};

const SORT_LABEL: Record<SortKey, string> = {
  updated: "Sort: Recently updated",
  name: "Sort: Name (A–Z)",
  versions: "Sort: Most versions",
};

/** Slack goes to Name and Linked; the metadata columns only get a floor plus a small share. */
const ROW_COLUMNS =
  "grid-cols-[22px_minmax(0,2.4fr)_minmax(0,1.3fr)_minmax(148px,0.8fr)_minmax(168px,0.9fr)_auto_84px]";

function relativeTime(ts: number): string {
  const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function firstLine(content: string): string {
  const line = content.split("\n").find((l) => l.trim().length > 0);
  return line?.trim() ?? "(empty prompt)";
}

export function PromptsList() {
  const { prompts, specs, users, currentUserId, createPrompt, deletePrompt, select, selectPrompt } = useStore();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MineFilter>("all");
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("updated");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function ownerOf(id: string) {
    return users.find((u) => u.id === id) ?? { name: "Unknown", initials: "?" };
  }

  function specNameOf(id: string | null) {
    if (!id) return null;
    return specs.find((s) => s.id === id)?.name ?? null;
  }

  function handleCreate() {
    const name = window.prompt("Name this Prompt", "New Prompt")?.trim();
    if (!name) return;
    createPrompt(name, currentUserId, "private");
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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return prompts
      .filter((p) => p.visibility === "org" || p.ownerId === currentUserId)
      .filter((p) => (filter === "mine" ? p.ownerId === currentUserId : filter === "org" ? p.visibility === "org" : true))
      .filter((p) => (linkFilter === "linked" ? !!p.specId : linkFilter === "standalone" ? !p.specId : true))
      .filter((p) => (statusFilter === "all" ? true : activePromptVersion(p).status === statusFilter))
      .filter((p) => {
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        if (sort === "versions") return b.versions.length - a.versions.length;
        return b.updatedAt - a.updatedAt;
      });
  }, [prompts, currentUserId, filter, linkFilter, statusFilter, query, sort]);

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sky-600">
            <Compass size={16} />
            <span className="text-xs font-semibold uppercase tracking-wider">Compass</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Prompts</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Every Spec's Prompt lives here automatically, alongside Prompts you create directly — each with its own
            version history. Click one to open it in the Playground.
          </p>
        </div>
        <Button variant="primary" onClick={handleCreate}>
          <Plus size={16} /> New Prompt
        </Button>
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
          value={linkFilter}
          onChange={(e) => setLinkFilter(e.target.value as LinkFilter)}
          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 outline-none"
        >
          {(Object.keys(LINK_FILTER_LABEL) as LinkFilter[]).map((k) => (
            <option key={k} value={k}>
              {LINK_FILTER_LABEL[k]}
            </option>
          ))}
        </select>
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
            {prompts.length === 0 ? "No Prompts yet — create one, or Generate a Prompt inside a Spec." : "Nothing matches these filters."}
          </p>
        </Card>
      ) : (
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          <div
            className={`grid ${ROW_COLUMNS} gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500`}
          >
            <span />
            <span>Name</span>
            <span>Linked</span>
            <span>Model · Version</span>
            <span>Owner</span>
            <span>Visibility</span>
            <span>Updated</span>
          </div>

          {visible.map((p) => {
            const expanded = expandedId === p.id;
            const owner = ownerOf(p.ownerId);
            const version = activePromptVersion(p);
            const specName = specNameOf(p.specId);
            const hasDraft = draftDiffersFromBase(p);

            return (
              <div key={p.id} className="border-b border-slate-100 last:border-b-0">
                <div className={`grid ${ROW_COLUMNS} items-center gap-3 px-4 py-3 hover:bg-slate-50`}>
                  <button
                    onClick={() => setExpandedId(expanded ? null : p.id)}
                    className="text-slate-500 hover:text-slate-800"
                    title="Show metadata"
                  >
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  <button onClick={() => selectPrompt(p.id)} className="min-w-0 text-left">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-slate-900 hover:text-sky-700">{p.name}</span>
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
                      className="flex min-w-0 items-center gap-1.5 text-xs text-sky-700 hover:text-sky-700"
                      title="Open the linked Spec"
                    >
                      <Link2 size={11} className="shrink-0" />
                      <span className="truncate">{specName}</span>
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">Standalone</span>
                  )}

                  <span className="truncate text-xs text-slate-600">
                    {version.model} · v{version.version}
                  </span>

                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600">
                    <Avatar name={owner.name} initials={owner.initials} />
                    <span className="truncate" title={owner.name}>{owner.name}</span>
                  </span>

                  <Badge tone={p.visibility === "org" ? "success" : "neutral"}>
                    {p.visibility === "org" ? (
                      <>
                        <Globe2 size={11} /> Org
                      </>
                    ) : (
                      <>
                        <Lock size={11} /> Private
                      </>
                    )}
                  </Badge>

                  <span className="text-xs text-slate-500">{relativeTime(p.updatedAt)}</span>
                </div>

                {expanded && (
                  <div className="grid grid-cols-1 gap-6 border-t border-slate-100 bg-slate-50 px-4 py-4 lg:grid-cols-2">
                    <div>
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        Version history
                      </p>
                      <p className="mb-2 text-[11px] text-slate-400">
                        Click any version to open it in the Playground.
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
                            <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                              {relativeTime(p.draft!.updatedAt)} · {firstLine(p.draft!.promptContent)}
                            </span>
                          </button>
                        )}
                        {[...p.versions].reverse().map((v) => (
                          <button
                            key={v.id}
                            onClick={() => selectPrompt(p.id, v.id)}
                            className={`block w-full rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                              v.id === p.activeVersionId
                                ? "border-slate-300 bg-slate-100 hover:border-slate-400"
                                : "border-slate-200 bg-slate-50 hover:border-slate-300"
                            }`}
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-xs text-slate-700">
                                v{v.version} · {v.model} · temp {v.temperature}
                              </span>
                              <span className="flex shrink-0 items-center gap-1">
                                {v.status === "published" && <Badge tone="success">Published</Badge>}
                                {v.id === p.activeVersionId && <Badge tone="accent">Current</Badge>}
                              </span>
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                              {relativeTime(v.createdAt)} · {firstLine(v.promptContent)}
                            </span>
                          </button>
                        ))}
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
                      <div>
                        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          Current version (v{version.version})
                        </p>
                        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-100 p-3 font-mono text-xs text-slate-700">
                          {version.promptContent || "(empty prompt)"}
                        </pre>
                      </div>
                      <p className="text-xs text-slate-400">
                        {p.versions.length} version{p.versions.length === 1 ? "" : "s"}
                        {p.specId ? " · edits here also update the linked Spec" : ""}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="secondary" onClick={() => selectPrompt(p.id)}>
                          Open in Playground
                        </Button>
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
      )}
    </PageShell>
  );
}
