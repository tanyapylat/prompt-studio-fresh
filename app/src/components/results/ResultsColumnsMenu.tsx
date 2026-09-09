import { useRef, useState } from "react";
import { Columns3 } from "lucide-react";
import type { ResultsColumnId, ResultsViewPrefs } from "../../resultsViewPrefs";
import { Button } from "@/components/ui/button";

const COLUMN_LABEL: Record<ResultsColumnId, string> = {
  output: "Output",
  referenceOutput: "Reference Output",
  checks: "Checks",
  latency: "Latency",
  cost: "Cost",
  labels: "Labels",
};

/**
 * "Columns" popover — lets a user hide the optional Results table columns (Status, Input(s), and
 * row actions are always shown). When the current prompt has more than one variable, also offers
 * splitting the single combined "Inputs" column into one column per variable.
 */
export function ResultsColumnsMenu({
  prefs,
  onToggleColumn,
  onUpdate,
  isMultiVariable,
}: {
  prefs: ResultsViewPrefs;
  onToggleColumn: (column: ResultsColumnId) => void;
  onUpdate: (patch: Partial<ResultsViewPrefs>) => void;
  isMultiVariable: boolean;
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
          <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg shadow-slate-900/10">
            <p className="truncate px-3 pt-1 pb-1.5 text-[10px] leading-4 font-semibold uppercase tracking-wide text-slate-400">
              Columns
            </p>
            {(Object.keys(COLUMN_LABEL) as ResultsColumnId[]).map((column, i, arr) => (
              <label
                key={column}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 ${i === 0 ? "rounded-t-md" : ""} ${
                  i === arr.length - 1 && !isMultiVariable ? "rounded-b-md" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={!prefs.hiddenColumns.includes(column)}
                  onChange={() => onToggleColumn(column)}
                  className="size-3.5 accent-primary"
                />
                {COLUMN_LABEL[column]}
              </label>
            ))}
            {isMultiVariable && (
              <>
                <div className="my-1 border-t border-slate-100" />
                <label className="flex items-center gap-2 rounded-b-md px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={prefs.splitInputColumns}
                    onChange={() => onUpdate({ splitInputColumns: !prefs.splitInputColumns })}
                    className="size-3.5 accent-primary"
                  />
                  One column per variable
                </label>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
