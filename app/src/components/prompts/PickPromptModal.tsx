import { useMemo, useState } from "react";
import { Globe2, Link2, Lock, Search } from "lucide-react";
import { useStore } from "../../store";
import { activePromptVersion } from "../../promptFactory";
import type { Prompt } from "../../types";
import { Avatar, Badge, Button, Modal, TextInput } from "../ui";

export function PickPromptModal({
  title,
  excludePromptId,
  onPick,
  onClose,
}: {
  title: string;
  excludePromptId?: string;
  onPick: (prompt: Prompt) => void;
  onClose: () => void;
}) {
  const { prompts, specs, users, currentUserId } = useStore();
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    return prompts
      .filter((p) => p.id !== excludePromptId)
      .filter((p) => p.visibility === "org" || p.ownerId === currentUserId)
      .filter((p) => {
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [prompts, excludePromptId, currentUserId, query]);

  function ownerName(id: string) {
    return users.find((u) => u.id === id) ?? { name: "Unknown", initials: "?" };
  }

  function specNameOf(id: string | null) {
    if (!id) return null;
    return specs.find((s) => s.id === id)?.name ?? null;
  }

  return (
    <Modal title={title} onClose={onClose} width="lg">
      <div className="space-y-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="pl-8" autoFocus />
        </div>

        {visible.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No other prompts to pick from yet.</p>}

        <div className="max-h-96 space-y-1.5 overflow-y-auto">
          {visible.map((p) => {
            const owner = ownerName(p.ownerId);
            const version = activePromptVersion(p);
            const specName = specNameOf(p.specId);
            return (
              <button
                key={p.id}
                onClick={() => {
                  onPick(p);
                  onClose();
                }}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left hover:border-sky-400 hover:bg-slate-100"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm text-slate-900">{p.name}</span>
                    <Badge tone={p.visibility === "org" ? "success" : "neutral"}>
                      {p.visibility === "org" ? <Globe2 size={11} /> : <Lock size={11} />}
                    </Badge>
                    {specName && (
                      <span className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Link2 size={10} /> {specName}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {version.model} · v{version.version}
                    {p.description ? ` — ${p.description}` : ""}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
                  <Avatar name={owner.name} initials={owner.initials} />
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex justify-end pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
