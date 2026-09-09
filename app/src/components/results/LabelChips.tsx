import { useState } from "react";
import { X } from "lucide-react";

/**
 * Inline chip editor for a Result row's `labels` — the same component renders compact inside a
 * table cell (`size="sm"`) and full-size in the side panel header (`size="md"`), so labels are
 * editable in both places without duplicating the interaction logic. Enter/comma commits the
 * current text as a new chip; Backspace on an empty input removes the last chip; typing filters
 * an autocomplete dropdown built from every label already used anywhere in this Spec's runs.
 */
export function LabelChips({
  labels,
  suggestions,
  onChange,
  size = "md",
  placeholder = "Add label…",
}: {
  labels: string[];
  suggestions: string[];
  onChange: (next: string[]) => void;
  size?: "sm" | "md";
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);

  function addLabel(raw: string) {
    const tag = raw.trim();
    setInput("");
    if (!tag || labels.includes(tag)) return;
    onChange([...labels, tag]);
  }

  function removeLabel(tag: string) {
    onChange(labels.filter((l) => l !== tag));
  }

  const filteredSuggestions = suggestions
    .filter((s) => !labels.includes(s))
    .filter((s) => !input.trim() || s.toLowerCase().includes(input.trim().toLowerCase()))
    .slice(0, 6);

  const chipClass = size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5";
  const inputClass = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <div onClick={(e) => e.stopPropagation()} className="relative flex min-h-[22px] flex-1 flex-wrap items-center gap-1">
      {labels.map((l) => (
        <span key={l} className={`inline-flex items-center gap-1 rounded-full bg-primary/10 font-medium text-primary ${chipClass}`}>
          {l}
          <button onClick={() => removeLabel(l)} className="rounded-full hover:bg-primary/20" title={`Remove "${l}"`}>
            <X size={size === "sm" ? 9 : 10} />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (input.trim()) addLabel(input);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addLabel(input);
          } else if (e.key === "Backspace" && !input && labels.length > 0) {
            removeLabel(labels[labels.length - 1]);
          } else if (e.key === "Escape") {
            setInput("");
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder={labels.length === 0 ? placeholder : ""}
        className={`min-w-[50px] flex-1 bg-transparent outline-none placeholder:text-slate-400 ${inputClass}`}
      />
      {focused && filteredSuggestions.length > 0 && (
        <div className="absolute left-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg shadow-slate-900/10">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              onMouseDown={(e) => {
                // Prevent the input's blur (which would fire before this click handler runs).
                e.preventDefault();
                addLabel(s);
              }}
              className="flex w-full items-center px-2.5 py-1 text-left text-xs text-slate-700 hover:bg-slate-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Read-only compact chip list — used where there's no room/need for the full editor (e.g. a disabled state). */
export function LabelChipsReadOnly({ labels }: { labels: string[] }) {
  if (labels.length === 0) return <span className="text-xs italic text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {labels.map((l) => (
        <span key={l} className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          {l}
        </span>
      ))}
    </div>
  );
}
