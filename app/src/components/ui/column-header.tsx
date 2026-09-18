import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Filter, Info } from "lucide-react";

export type SortDir = "asc" | "desc";
export type UpdatedAtPreset = "any" | "today" | "week" | "month";

export const UPDATED_AT_PRESET_LABEL: Record<UpdatedAtPreset, string> = {
  any: "Any time",
  today: "Today",
  week: "Past 7 days",
  month: "Past 30 days",
};

/** Shared date-window predicate behind every "Updated" column filter (Specs, Prompts, Library). */
export function matchesUpdatedAtPreset(ts: number, preset: UpdatedAtPreset): boolean {
  if (preset === "any") return true;
  const days = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  if (preset === "today") return days < 1;
  if (preset === "week") return days < 7;
  return days < 30;
}

/**
 * A sortable, filterable table header cell — click the label to sort, the funnel to filter.
 * Generic over the column-key union so every list (Specs, Prompts, Library) can share one
 * implementation instead of re-authoring the same sort/filter-popover interaction.
 */
export function ColumnHeader<K extends string>({
  label,
  title,
  columnKey,
  activeSort,
  sortDir,
  onSort,
  filterActive,
  isFilterOpen,
  onToggleFilter,
  filterContent,
}: {
  label: string;
  title?: string;
  columnKey: K;
  activeSort: K;
  sortDir: SortDir;
  onSort: (key: K) => void;
  filterActive: boolean;
  isFilterOpen: boolean;
  onToggleFilter: (key: K | null) => void;
  filterContent?: ReactNode;
}) {
  const isActiveSort = activeSort === columnKey;
  return (
    <div className="group relative flex items-center gap-1">
      {/* Explanatory tooltips are otherwise invisible (native `title` only shows up if you happen
          to hover) — this icon is the hint that there's more to read here. Kept as a plain `span`,
          separate from the sort button and placed before the label, so hovering/clicking it can
          never register as a sort click, and it stays put instead of drifting whenever the label
          or sort arrow next to it changes width. `cursor-help` (not the button's pointer cursor)
          signals it isn't itself clickable. */}
      {title && (
        <span title={title} className="shrink-0 cursor-help text-slate-400 hover:text-slate-600">
          <Info size={11} />
        </span>
      )}
      <button
        onClick={() => onSort(columnKey)}
        className={`flex items-center gap-1 hover:text-slate-800 ${isActiveSort ? "text-slate-800" : ""}`}
      >
        {label}
        {isActiveSort ? (
          sortDir === "asc" ? (
            <ArrowUp size={11} />
          ) : (
            <ArrowDown size={11} />
          )
        ) : (
          <ArrowUpDown size={11} className="opacity-0 transition-opacity group-hover:opacity-40" />
        )}
      </button>
      {filterContent && (
        <>
          <button
            onClick={() => onToggleFilter(isFilterOpen ? null : columnKey)}
            title={`Filter by ${label}`}
            className={`rounded p-0.5 hover:bg-slate-200 ${filterActive ? "text-primary" : "text-slate-400"}`}
          >
            <Filter size={11} />
          </button>
          {isFilterOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute left-0 top-full z-30 mt-1.5 w-56 rounded-xl border border-slate-200 bg-white p-2.5 normal-case tracking-normal text-slate-700 shadow-xl"
            >
              {filterContent}
            </div>
          )}
        </>
      )}
    </div>
  );
}
