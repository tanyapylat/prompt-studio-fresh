import { useMemo, useState } from "react";
import { Globe2, Lock, Search, Sparkles } from "lucide-react";
import { useStore } from "../../store";
import type { AssertionTier, LibraryKind } from "../../types";
import { searchLibraryEntries, type AnyLibraryEntry, type AssertionTierFilter } from "../../librarySearch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const TIER_META: Record<AssertionTier, string> = {
  deterministic: "Deterministic",
  custom_code: "Custom code",
  rubric_grading: "LLM judge",
};

const TIER_FILTERS: AssertionTierFilter[] = ["all", "deterministic", "custom_code", "rubric_grading"];

export function LoadFromLibraryModal({
  title,
  kind,
  onPick,
  onClose,
}: {
  title: string;
  kind: LibraryKind;
  onPick: (entry: AnyLibraryEntry, datasetMode?: "append" | "replace") => void;
  onClose: () => void;
}) {
  const { library, users, currentUserId } = useStore();
  const [query, setQuery] = useState("");
  const [semantic, setSemantic] = useState(false);
  const [tierFilter, setTierFilter] = useState<AssertionTierFilter>("all");
  const [datasetMode, setDatasetMode] = useState<"append" | "replace">("append");

  const entries = library[kind] as AnyLibraryEntry[];

  const visible = useMemo(() => {
    const scoped = entries.filter((e) => e.visibility === "org" || e.ownerId === currentUserId);
    const searched = searchLibraryEntries(kind, scoped, {
      query,
      mode: semantic ? "semantic" : "keyword",
      tier: kind === "assertions" ? tierFilter : undefined,
    });
    return query.trim() && semantic ? searched : [...searched].sort((a, b) => b.usageCount - a.usageCount);
  }, [entries, currentUserId, query, semantic, tierFilter, kind]);

  function ownerName(id: string) {
    return users.find((u) => u.id === id) ?? { name: "Unknown", initials: "?" };
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent width="lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody className="pb-0">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="pl-8"
                  autoFocus
                />
              </div>
              <button
                type="button"
                onClick={() => setSemantic((s) => !s)}
                title="Heuristic local search over synonyms/related terms — not an embeddings API call."
                className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  semantic ? "border-primary bg-accent text-accent-foreground" : "border-border text-slate-600 hover:bg-secondary"
                }`}
              >
                <Sparkles size={13} /> Semantic
              </button>
            </div>

            {kind === "assertions" && (
              <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted p-0.5">
                {TIER_FILTERS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTierFilter(t)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      tierFilter === t ? "bg-primary text-primary-foreground" : "text-slate-600 hover:text-slate-800"
                    }`}
                  >
                    {t === "all" ? "All types" : TIER_META[t]}
                  </button>
                ))}
              </div>
            )}

            {kind === "datasets" && (
              <div className="flex gap-2 text-xs">
                {(["append", "replace"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDatasetMode(m)}
                    className={`rounded-lg border px-2.5 py-1 font-medium transition-colors ${
                      datasetMode === m
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-border text-slate-600 hover:bg-secondary"
                    }`}
                  >
                    {m === "append" ? "Append to current rows" : "Replace current rows"}
                  </button>
                ))}
              </div>
            )}

            {visible.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Nothing here yet.</p>}

            <div className="max-h-96 space-y-1.5 overflow-y-auto">
              {visible.map((entry) => {
                const owner = ownerName(entry.ownerId);
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      onPick(entry, datasetMode);
                      onClose();
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-muted px-3 py-2.5 text-left hover:border-ring/60 hover:bg-secondary"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm text-slate-900">{entry.name}</span>
                        <Badge tone={entry.visibility === "org" ? "success" : "neutral"}>
                          {entry.visibility === "org" ? <Globe2 size={11} /> : <Lock size={11} />}
                        </Badge>
                        {kind === "assertions" && <Badge>{TIER_META[(entry as { tier: AssertionTier }).tier]}</Badge>}
                      </div>
                      {entry.description && <p className="mt-0.5 truncate text-xs text-slate-500">{entry.description}</p>}
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
                      <Avatar title={owner.name}>
                        <AvatarFallback>{owner.initials}</AvatarFallback>
                      </Avatar>
                      {entry.usageCount} uses
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
