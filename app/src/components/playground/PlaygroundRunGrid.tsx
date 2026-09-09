import { CheckCircle2, Eye, XCircle } from "lucide-react";
import type { DatasetItem, RunGroup } from "../../types";
import { datasetItemInputsPreview } from "../../dataset";
import { formatLatency } from "../../results";
import { Badge } from "@/components/ui/badge";

/**
 * The Playground's compact dataset grid — one row per Dataset item, joined live against the most
 * recent Run's result for that row (Output + pass/fail), so a Prompt's dataset and eval outcomes
 * are visible right below the editor without leaving the page. Deliberately simple (no pagination/
 * sorting/column config, unlike the Spec Workspace's full `DatasetTable`/`ResultsTable`) — this is
 * meant as a convenient at-a-glance view, not a replacement for the Workspace's Dataset/Results tabs.
 * Row click opens the shared detail panel (`PlaygroundDatasetSection` decides Result vs. plain
 * Dataset view depending on whether this row has been run).
 */
export function PlaygroundRunGrid({
  items,
  variableNames,
  lastRun,
  wrap,
  selectedIds,
  onToggleSelect,
  onBulkSelect,
  onOpenItem,
}: {
  items: DatasetItem[];
  variableNames: string[];
  lastRun: RunGroup | null;
  wrap: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onBulkSelect: (ids: string[], selected: boolean) => void;
  onOpenItem: (id: string) => void;
}) {
  const resultByItem = new Map((lastRun?.results ?? []).map((r) => [r.datasetItemId, r]));
  const showReferenceOutput = items.some((it) => it.expectedOutput);
  const allSelected = items.length > 0 && items.every((it) => selectedIds.has(it.id));
  const cellTextClass = wrap ? "whitespace-pre-wrap break-words align-top" : "truncate whitespace-nowrap align-top";
  const columnCount = 5 + (showReferenceOutput ? 1 : 0);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <th className="w-8 border-b border-slate-200 px-2.5 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onBulkSelect(items.map((it) => it.id), !allSelected)}
                  className="size-3.5 accent-primary"
                  title="Select all rows"
                />
              </th>
              <th className="min-w-[220px] border-b border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-500">
                Inputs
              </th>
              {showReferenceOutput && (
                <th className="min-w-[160px] border-b border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-500">
                  Reference Output
                </th>
              )}
              <th className="min-w-[240px] border-b border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-500">
                Output
              </th>
              <th className="w-28 border-b border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-500">Result</th>
              <th className="w-20 border-b border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-500">Latency</th>
              <th className="w-9 border-b border-slate-200 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const result = resultByItem.get(item.id);
              const total = result?.scores.length ?? 0;
              const passCount = result ? result.scores.filter((s) => s.passed).length : 0;
              const allPass = total > 0 && passCount === total;
              return (
                <tr
                  key={item.id}
                  onClick={() => onOpenItem(item.id)}
                  className="cursor-pointer odd:bg-white even:bg-slate-50/50 hover:bg-accent/60"
                >
                  <td className="border-b border-slate-100 px-2.5 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => onToggleSelect(item.id)}
                      className="size-3.5 accent-primary"
                    />
                  </td>
                  <td className={`max-w-[320px] border-b border-slate-100 px-2.5 py-2 text-slate-700 ${cellTextClass}`}>
                    {datasetItemInputsPreview(item, variableNames) || "—"}
                  </td>
                  {showReferenceOutput && (
                    <td className={`max-w-[240px] border-b border-slate-100 px-2.5 py-2 ${cellTextClass}`}>
                      {item.expectedOutput ? (
                        <span className="text-slate-700">{item.expectedOutput}</span>
                      ) : (
                        <span className="italic text-slate-400">—</span>
                      )}
                    </td>
                  )}
                  <td className={`max-w-[360px] border-b border-slate-100 px-2.5 py-2 ${cellTextClass}`}>
                    {result ? (
                      <span className="text-slate-800">{result.output || "—"}</span>
                    ) : (
                      <span className="italic text-slate-400">Not run yet</span>
                    )}
                  </td>
                  <td className="border-b border-slate-100 px-2.5 py-2">
                    {result && total > 0 ? (
                      <Badge tone={allPass ? "success" : "danger"}>
                        {allPass ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                        {passCount}/{total}
                      </Badge>
                    ) : result ? (
                      <span className="text-slate-400">no checks</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="border-b border-slate-100 px-2.5 py-2 whitespace-nowrap text-slate-500">
                    {formatLatency(result?.latencyMs)}
                  </td>
                  <td className="border-b border-slate-100 px-2 py-2 text-slate-300">
                    <Eye size={13} />
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="px-3 py-6 text-center text-slate-400">
                  No rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
