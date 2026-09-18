import { useRef, useState } from "react";
import { Columns3 } from "lucide-react";
import type { EvalRunsColumnId, EvalRunsViewPrefs } from "../../evalRunsViewPrefs";
import { Button } from "@/components/ui/button";

const COLUMN_LABEL: Record<EvalRunsColumnId, string> = {
  author: "Author",
  createdAt: "Created",
  passRate: "Pass rate",
  tests: "Test cases",
};

/** "Columns" popover for the Eval Runs list — Run ID and Description are always shown (row identity). */
export function EvalRunsColumnsMenu({
  prefs,
  onToggleColumn,
  onUpdate,
}: {
  prefs: EvalRunsViewPrefs;
  onToggleColumn: (column: EvalRunsColumnId) => void;
  onUpdate: (patch: Partial<EvalRunsViewPrefs>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className="relative" ref={ref}>
      <Button size="sm" onClick={() => setOpen((v) => !v)}>
        <Columns3 size={13} /> Columns
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg shadow-slate-900/10">
            <p className="truncate px-3 pt-1 pb-1.5 text-[10px] leading-4 font-semibold uppercase tracking-wide text-slate-400">
              Columns
            </p>
            {(Object.keys(COLUMN_LABEL) as EvalRunsColumnId[]).map((column) => (
              <label key={column} className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={!prefs.hiddenColumns.includes(column)}
                  onChange={() => onToggleColumn(column)}
                  className="size-3.5 accent-primary"
                />
                {COLUMN_LABEL[column]}
              </label>
            ))}
            <div className="my-1 border-t border-slate-100" />
            <label className="flex items-center gap-2 rounded-b-md px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={prefs.stickyHeader}
                onChange={() => onUpdate({ stickyHeader: !prefs.stickyHeader })}
                className="size-3.5 accent-primary"
              />
              Sticky header
            </label>
          </div>
        </>
      )}
    </div>
  );
}
