import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, X, XCircle } from "lucide-react";
import type { Assertion, RunGroup } from "../../types";
import { resolveDatasetItemValues } from "../../dataset";
import { formatCost, formatLatency, type ResultRow } from "../../results";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LabelChips } from "./LabelChips";

type PanelTab = "output" | "evaluation" | "metadata";

const TABS: { id: PanelTab; label: string }[] = [
  { id: "output", label: "Prompt & Output" },
  { id: "evaluation", label: "Evaluation" },
  { id: "metadata", label: "Metadata" },
];

/**
 * Full-detail side panel for one Results row — the "full view" companion to the compact table.
 * Three tabs mirror the promptfoo-style detail drawer: raw input/output, per-assertion evaluation
 * (pass/score/reason), and run metadata (latency/cost/mode/note). Prev/Next step through `rows`
 * (the table's current sorted/filtered order) without closing the panel.
 */
export function ResultItemPanel({
  rows,
  datasetItemId,
  variableNames,
  assertions,
  run,
  allLabels,
  onClose,
  onNavigate,
  onSetNote,
  onSetLabels,
}: {
  rows: ResultRow[];
  datasetItemId: string;
  variableNames: string[];
  assertions: Assertion[];
  run: RunGroup;
  allLabels: string[];
  onClose: () => void;
  onNavigate: (datasetItemId: string) => void;
  onSetNote: (datasetItemId: string, note: string) => void;
  onSetLabels: (datasetItemId: string, labels: string[]) => void;
}) {
  const index = rows.findIndex((r) => r.result.datasetItemId === datasetItemId);
  const row = index >= 0 ? rows[index] : null;
  const [tab, setTab] = useState<PanelTab>("output");
  const [noteDraft, setNoteDraft] = useState("");

  useEffect(() => {
    setNoteDraft(row?.result.note ?? "");
    // Re-sync the note draft whenever we switch rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetItemId]);

  if (!row) return null;
  const { result, item, failCount, passCount } = row;
  const allPass = failCount === 0;
  const assertionMap = new Map(assertions.map((a) => [a.id, a]));
  const values = item ? resolveDatasetItemValues(item, variableNames) : {};

  function handleNoteBlur() {
    if (noteDraft !== (result.note ?? "")) onSetNote(datasetItemId, noteDraft);
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent width="xl" showCloseButton={false}>
        <SheetHeader className="flex-col items-stretch gap-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SheetTitle>
                Row {index + 1} of {rows.length}
              </SheetTitle>
              <Badge tone={allPass ? "success" : "danger"}>
                {allPass ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                {passCount}/{result.scores.length} passed
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                title="Previous row"
                disabled={index <= 0}
                onClick={() => onNavigate(rows[index - 1].result.datasetItemId)}
              >
                <ChevronUp size={14} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                title="Next row"
                disabled={index >= rows.length - 1}
                onClick={() => onNavigate(rows[index + 1].result.datasetItemId)}
              >
                <ChevronDown size={14} />
              </Button>
              <button
                onClick={onClose}
                className="ml-1 rounded-md p-1.5 text-slate-400 outline-none hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-slate-400">Labels</span>
            <LabelChips
              labels={result.labels ?? []}
              suggestions={allLabels}
              onChange={(next) => onSetLabels(datasetItemId, next)}
              size="md"
              placeholder="Add a label…"
            />
          </div>
          <div className="mt-3 flex gap-1 border-b border-transparent">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`-mb-px border-b-2 px-2.5 py-2 text-xs font-medium transition-colors ${
                  tab === t.id ? "border-primary text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </SheetHeader>

        <SheetBody className="space-y-5">
          {tab === "output" && (
            <>
              <div className="space-y-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Input</h4>
                <div className="space-y-2">
                  {variableNames.length > 0 ? (
                    variableNames.map((name) => (
                      <div key={name} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                        {variableNames.length > 1 && (
                          <label className="mb-1 block font-mono text-[10px] text-primary">{`{${name}}`}</label>
                        )}
                        <p className="whitespace-pre-wrap break-words text-xs text-slate-800">{values[name] || "—"}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs italic text-slate-400">No dataset row found for this result (it may have been deleted).</p>
                  )}
                </div>
              </div>

              <div className="space-y-2 border-t border-slate-200 pt-4">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Output</h4>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800">
                  {result.output || "—"}
                </pre>
              </div>

              <div className="space-y-2 border-t border-slate-200 pt-4">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Reference Output</h4>
                {item?.expectedOutput ? (
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800">
                    {item.expectedOutput}
                  </pre>
                ) : (
                  <p className="text-xs italic text-slate-400">No reference output set for this row.</p>
                )}
              </div>
            </>
          )}

          {tab === "evaluation" && (
            <div className="space-y-2">
              {result.scores.length === 0 && <p className="text-xs italic text-slate-400">No checks were run for this row.</p>}
              {result.scores.map((sc) => {
                const assertion = assertionMap.get(sc.assertionId);
                return (
                  <div key={sc.assertionId} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        {sc.passed ? (
                          <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" />
                        ) : (
                          <XCircle size={13} className="mt-0.5 shrink-0 text-rose-600" />
                        )}
                        <div>
                          <p className="text-xs font-medium text-slate-800">{assertion?.description ?? "(deleted check)"}</p>
                          {assertion?.group && <p className="text-[10px] uppercase tracking-wide text-slate-400">{assertion.group}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {assertion && <Badge tone="neutral">{assertion.tier.replace("_", " ")}</Badge>}
                        {sc.score !== undefined && <Badge tone={sc.passed ? "success" : "danger"}>{sc.score.toFixed(2)}</Badge>}
                      </div>
                    </div>
                    <p className={`mt-1.5 text-xs ${sc.passed ? "text-slate-600" : "text-rose-700"}`}>{sc.reason}</p>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "metadata" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Latency</p>
                  <p className="text-sm font-semibold text-slate-800">{formatLatency(result.latencyMs)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Cost</p>
                  <p className="text-sm font-semibold text-slate-800">{formatCost(result.costUsd)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Run mode</p>
                  <p className="text-sm font-semibold text-slate-800">{run.mode === "live" ? "Live" : "Simulated"}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Run scope</p>
                  <p className="text-sm font-semibold text-slate-800">{run.scope === "sample" ? "Sample" : "Full"}</p>
                </div>
                <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Row id</p>
                  <p className="break-all font-mono text-xs text-slate-700">{result.datasetItemId}</p>
                </div>
              </div>

              <div className="space-y-2 border-t border-slate-200 pt-4">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Open-coding note</h4>
                <AutoGrowTextarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onBlur={handleNoteBlur}
                  placeholder="What's actually going on here, in your own words…"
                  minHeight={64}
                  maxHeight={240}
                />
              </div>
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
