import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Minus, StickyNote, X, XCircle } from "lucide-react";
import type { Assertion, RunVariant } from "../../types";
import { resolveDatasetItemValues, tryPrettyPrintText } from "../../dataset";
import { rowStatus, type ComparisonRow } from "../../results";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DatasetSourceIcon } from "../dataset/DatasetSourceIcon";
import { variantColor } from "./charts";
import { SegmentedToggle } from "./ResultsFiltersMenu";

/** Mirrors `ResultItemPanel`'s same-named type — "any variant matches" semantics here, consistent with `comparisonRowMatchesAssertion`. */
type AssertionOutcomeFilter = "all" | "passed" | "failed" | "na";

/**
 * The comparison view's equivalent of `ResultItemPanel` — one dataset row, but with every
 * variant's output shown side by side (so a difference is visible at a glance) and every
 * assertion's outcome shown per variant in one row (so "which variant regressed on this
 * assertion" doesn't require counting across separate panels). Input and the reviewer note are
 * shared/shown once, since they're the same regardless of which variant produced the output.
 */
export function ComparisonItemPanel({
  rows,
  datasetItemId,
  variableNames,
  variants,
  assertions,
  onClose,
  onNavigate,
  onSetNote,
}: {
  rows: ComparisonRow[];
  datasetItemId: string;
  variableNames: string[];
  variants: RunVariant[];
  assertions: Assertion[];
  onClose: () => void;
  onNavigate: (datasetItemId: string) => void;
  onSetNote?: (datasetItemId: string, note: string) => void;
}) {
  const index = rows.findIndex((r) => r.datasetItemId === datasetItemId);
  const row = index >= 0 ? rows[index] : null;
  const [noteDraft, setNoteDraft] = useState(row?.item?.note ?? "");
  const [assertionOutcomeFilter, setAssertionOutcomeFilter] = useState<AssertionOutcomeFilter>("all");

  useEffect(() => {
    setNoteDraft(row?.item?.note ?? "");
  }, [datasetItemId, row?.item?.note]);

  // Resets on Prev/Next, same reasoning as `ResultItemPanel` — a "Failed" filter left on from the
  // last row shouldn't silently hide everything on the next one.
  useEffect(() => {
    setAssertionOutcomeFilter("all");
  }, [datasetItemId]);

  if (!row) return null;
  const values = row.item ? resolveDatasetItemValues(row.item, variableNames) : {};

  function saveNote() {
    if (row!.item && onSetNote && noteDraft !== (row!.item.note ?? "")) onSetNote(row!.item.id, noteDraft);
  }

  /** "Any variant" semantics — an assertion row stays visible if at least one variant's score for it matches the chosen outcome. */
  function assertionMatchesOutcomeFilter(assertion: Assertion): boolean {
    if (assertionOutcomeFilter === "all") return true;
    return variants.some((_v, i) => {
      const result = row!.results[i];
      if (!result || rowStatus(result) === "error") return false;
      const sc = result.scores.find((s) => s.assertionId === assertion.id);
      if (!sc) return false;
      if (assertionOutcomeFilter === "na") return !!sc.na;
      if (assertionOutcomeFilter === "passed") return !sc.na && sc.passed;
      return !sc.na && !sc.passed;
    });
  }
  const visibleAssertions = assertions.filter(assertionMatchesOutcomeFilter);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent width="full" showCloseButton={false}>
        <SheetHeader className="flex-col items-stretch gap-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SheetTitle>
                Row {index + 1} of {rows.length}
              </SheetTitle>
              {row.item && <DatasetSourceIcon source={row.item.source} size={15} />}
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" title="Previous row" disabled={index <= 0} onClick={() => onNavigate(rows[index - 1].datasetItemId)}>
                <ChevronUp size={14} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                title="Next row"
                disabled={index >= rows.length - 1}
                onClick={() => onNavigate(rows[index + 1].datasetItemId)}
              >
                <ChevronDown size={14} />
              </Button>
              <button onClick={onClose} className="ml-1 rounded-md p-1.5 text-slate-400 outline-none hover:bg-slate-100 hover:text-slate-700">
                <X size={16} />
              </button>
            </div>
          </div>
        </SheetHeader>

        <SheetBody className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_2fr]">
            <div className="space-y-3">
              <div>
                <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Input</h4>
                <div className="space-y-2">
                  {variableNames.map((name) => (
                    <div key={name} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                      {variableNames.length > 1 && <label className="mb-1 block font-mono text-[10px] text-primary">{`{${name}}`}</label>}
                      <p className="whitespace-pre-wrap break-words text-xs text-slate-800">{tryPrettyPrintText(values[name] || "") || "—"}</p>
                    </div>
                  ))}
                </div>
              </div>
              {row.item && (
                <div>
                  <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <StickyNote size={12} /> Reviewer note
                  </h4>
                  {onSetNote ? (
                    <textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      onBlur={saveNote}
                      rows={3}
                      placeholder="Notable about this test case…"
                      className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800 outline-none focus:border-ring"
                    />
                  ) : (
                    <p className="text-xs italic text-slate-400">{row.item.note || "No note on this row."}</p>
                  )}
                </div>
              )}
              {row.item?.expectedOutput && (
                <div>
                  <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Reference Output</h4>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-xs text-slate-800">
                    {tryPrettyPrintText(row.item.expectedOutput)}
                  </pre>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Output by variant</h4>
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(variants.length, 3)}, minmax(0,1fr))` }}>
                {variants.map((v, i) => {
                  const result = row.results[i];
                  const status = result ? rowStatus(result) : "error";
                  return (
                    <div key={v.id} className="min-w-0 space-y-1.5">
                      <p className="flex items-center gap-1.5 truncate text-xs font-medium text-slate-700" title={v.label}>
                        <span className="size-2 shrink-0 rounded-full" style={{ background: variantColor(i) }} />
                        {v.label}
                      </p>
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] text-slate-800">
                        {status === "error" ? result?.error || "Errored" : tryPrettyPrintText(result?.output || "") || "—"}
                      </pre>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-200 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Assertions by variant</h4>
              {assertions.length > 0 && (
                <SegmentedToggle
                  value={assertionOutcomeFilter}
                  options={[
                    { id: "all", label: "All" },
                    { id: "passed", label: "Passed" },
                    { id: "failed", label: "Failed" },
                    { id: "na", label: "N/A" },
                  ]}
                  onChange={(v) => setAssertionOutcomeFilter(v)}
                />
              )}
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="border-b border-slate-200 px-3 py-2 text-[11px] font-medium text-slate-500">Assertion</th>
                    {variants.map((v, i) => (
                      <th key={v.id} className="border-b border-slate-200 px-3 py-2 text-[11px] font-medium text-slate-500">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="size-2 rounded-full" style={{ background: variantColor(i) }} />
                          {v.label}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleAssertions.map((a) => (
                    <tr key={a.id} className="border-b border-slate-100 last:border-b-0 odd:bg-white even:bg-slate-50/50">
                      <td className="px-3 py-2 align-top text-slate-700">{a.description}</td>
                      {variants.map((_v, i) => {
                        const result = row.results[i];
                        const sc = result?.scores.find((s) => s.assertionId === a.id);
                        if (!result || rowStatus(result) === "error") {
                          return (
                            <td key={i} className="px-3 py-2 align-top">
                              <AlertTriangle size={13} className="text-amber-500" />
                            </td>
                          );
                        }
                        if (!sc) {
                          return (
                            <td key={i} className="px-3 py-2 align-top text-slate-300">
                              —
                            </td>
                          );
                        }
                        return (
                          <td key={i} className="px-3 py-2 align-top" title={sc.reason}>
                            {sc.na ? (
                              <span className="inline-flex items-center gap-1 text-slate-400">
                                <Minus size={12} /> n/a
                              </span>
                            ) : (
                              <Badge tone={sc.passed ? "success" : "danger"}>
                                {sc.passed ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                                {sc.score !== undefined ? sc.score.toFixed(2) : sc.passed ? "pass" : "fail"}
                              </Badge>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {assertions.length === 0 && (
                    <tr>
                      <td colSpan={1 + variants.length} className="px-3 py-4 text-center text-slate-400">
                        No assertions configured.
                      </td>
                    </tr>
                  )}
                  {assertions.length > 0 && visibleAssertions.length === 0 && (
                    <tr>
                      <td colSpan={1 + variants.length} className="px-3 py-4 text-center text-slate-400">
                        No assertions match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-slate-400">Hover an assertion's badge to see its full reasoning.</p>
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
