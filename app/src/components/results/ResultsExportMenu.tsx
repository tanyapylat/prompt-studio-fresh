import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type ExportScope = "all" | "filtered" | "selected";

/** "Export" popover — pick a row scope (filtered/selected/all) then a format; used for both JSON and CSV downloads. */
export function ResultsExportMenu({
  filteredCount,
  selectedCount,
  totalCount,
  onExport,
}: {
  filteredCount: number;
  selectedCount: number;
  totalCount: number;
  onExport: (scope: ExportScope, format: "json" | "csv") => void;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ExportScope>("filtered");
  const ref = useRef<HTMLDivElement>(null);

  const scopeOptions: { id: ExportScope; label: string; count: number; disabled?: boolean }[] = [
    { id: "filtered", label: "Filtered rows", count: filteredCount },
    { id: "selected", label: "Selected rows", count: selectedCount, disabled: selectedCount === 0 },
    { id: "all", label: "All rows", count: totalCount },
  ];

  return (
    <div className="relative" ref={ref}>
      <Button size="sm" onClick={() => setOpen((v) => !v)}>
        <Download size={13} /> Export
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-56 space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg shadow-slate-900/10">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Export</p>
            <div className="flex flex-col gap-1">
              {scopeOptions.map((opt) => (
                <button
                  key={opt.id}
                  disabled={opt.disabled}
                  onClick={() => setScope(opt.id)}
                  className={`flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
                    scope === opt.id ? "bg-primary/10 text-primary" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                  <span className={scope === opt.id ? "text-primary" : "text-slate-400"}>{opt.count}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2 border-t border-slate-100 pt-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => {
                  onExport(scope, "json");
                  setOpen(false);
                }}
              >
                JSON
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={() => {
                  onExport(scope, "csv");
                  setOpen(false);
                }}
              >
                CSV
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
