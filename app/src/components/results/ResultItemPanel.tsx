import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Minus, StickyNote, X, XCircle } from "lucide-react";
import type { Assertion, CodeCheck } from "../../types";
import { getModeSpec } from "../../assertionCatalog";
import { resolveDatasetItemValues, tryPrettyPrintText } from "../../dataset";
import { flattenAssertions, formatCost, formatLatency, formatTokens, tokensPerSecond, type ResultRow } from "../../results";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LabelChips } from "./LabelChips";
import { SegmentedToggle } from "./ResultsFiltersMenu";
import { DatasetSourceIcon } from "../dataset/DatasetSourceIcon";

/** One row's Assertions list, scoped down to a single outcome — mirrors the table's Assertions column header filter (`AssertionsHeaderFilter` in `ResultsTable.tsx`) but as a full 4-way toggle, since a busy row (dozens of assertions) benefits from isolating passes just as much as failures. */
type AssertionOutcomeFilter = "all" | "passed" | "failed" | "na";

function matchesAssertionOutcomeFilter(sc: { na?: boolean; passed: boolean }, filter: AssertionOutcomeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "na") return !!sc.na;
  if (filter === "passed") return !sc.na && sc.passed;
  return !sc.na && !sc.passed;
}

/** promptfoo's Evaluation table has a "Type" column (`equals`, `contains`, `llm-rubric`, …) — this is the AI Studio equivalent for one Assertion's tier/check. */
function assertionTypeLabel(assertion: Assertion): string {
  // Composite/grouped assertion (promptfoo's assert-set) — checked first since `tier` on a group
  // is an arbitrary placeholder (see `Assertion.children`'s doc comment), not the real type.
  if (assertion.children?.length) return `Group · ${assertion.children.length} sub-check${assertion.children.length === 1 ? "" : "s"}`;
  if (assertion.tier === "rubric_grading") return "LLM rubric";
  if (assertion.tier === "custom_code") return `Custom code${assertion.codeLanguage === "python" ? " (Python)" : " (JavaScript)"}`;
  return assertion.check ? getModeSpec(assertion.check.mode).label : "—";
}

/**
 * Only LLM rubric (and, secondarily, a Group's aggregate) gets an actual color here — deterministic
 * and custom-code stay plain/neutral. This card already has a strong green/red pass-fail signal
 * (the check/X icon, the score badge, the reason text color); piling a 3-way tier color scheme on
 * top of that would compete with it. What's actually easy to miss is specifically "this assertion's
 * pass/fail came from an LLM's judgment, not exact code" — so only that gets called out, the same
 * "info" tone the Eval pane's own tier badges use for `rubric_grading` (see `TIER_META` in
 * EvalPane.tsx), for visual consistency with where a reviewer would go to look up the assertion.
 */
function assertionTypeTone(assertion: Assertion): "info" | "accent" | "neutral" {
  if (assertion.children?.length) return "accent";
  if (assertion.tier === "rubric_grading") return "info";
  return "neutral";
}

/** Same idea as `assertionTypeTone`, applied to the card's left edge instead of the type badge — an
 * even quieter version of the same signal for someone scanning the list of cards top to bottom
 * rather than reading each badge. */
function assertionAccentBorder(assertion: Assertion | undefined): string {
  if (!assertion) return "border-l-slate-200";
  if (assertion.children?.length) return "border-l-primary/40";
  if (assertion.tier === "rubric_grading") return "border-l-sky-300";
  return "border-l-slate-200";
}

/**
 * promptfoo's Evaluation table has a "Value" column — what the output was actually checked
 * against. Uses each mode's own `needsValue`/`needsReference`/`needsThreshold`/`needsMinMax` flags
 * (`assertionCatalog.ts`) instead of hardcoding per-mode formatting, so it stays correct if the
 * catalog changes.
 */
function checkValueDisplay(check: CodeCheck): string {
  const spec = getModeSpec(check.mode);
  const parts: string[] = [];
  if (spec.needsMinMax) {
    if (check.min !== undefined && check.max !== undefined) parts.push(`${check.min}–${check.max} words`);
    else if (check.min !== undefined) parts.push(`≥ ${check.min} words`);
    else if (check.max !== undefined) parts.push(`≤ ${check.max} words`);
  }
  if (spec.needsValue && check.value) parts.push(`"${check.value}"`);
  if (spec.needsReference && check.reference) parts.push(`ref: "${check.reference}"`);
  if (spec.needsThreshold && check.threshold !== undefined) parts.push(`${spec.thresholdLabel ?? "threshold"}: ${check.threshold}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/**
 * Collapsible display for one LLM rubric's instructions — rubrics are the one tier whose "what was
 * this judged against" text can run long (several sentences/paragraphs, per Veronica's real
 * examples), so unlike the short one-liner `checkValueDisplay` shows for deterministic checks, this
 * can't just always render in full without dominating the panel. Collapsed to a few lines with a
 * fade + "Show full rubric" by default; short rubrics that already fit get no toggle at all.
 */
function RubricText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 220 || text.split("\n").length > 4;
  return (
    <div>
      <div className={`relative overflow-hidden ${!expanded && isLong ? "max-h-[4.6em]" : ""}`}>
        <p className="whitespace-pre-wrap break-words text-[11px] text-slate-600">{text}</p>
        {!expanded && isLong && <div className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-white to-transparent" />}
      </div>
      {isLong && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="mt-1 text-[10px] font-medium text-primary hover:underline"
        >
          {expanded ? "Show less" : "Show full rubric"}
        </button>
      )}
    </div>
  );
}

/**
 * Full-detail side panel for one Results row. Replaces the old 3-tab (Output / Evaluation /
 * Metadata) layout with a two-column split so output and evaluation are always visible together —
 * the whole point being that reading a rubric's reasoning next to the exact output it's judging
 * shouldn't require holding either one in your head while you click to the other tab:
 *   - LEFT (pinned): input(s), output, reference output, and the row's persistent reviewer note —
 *     the "what happened" context that every assertion on the right refers back to.
 *   - RIGHT (scrolls independently): every assertion, expanded — pass/fail/n/a, score, type, and
 *     (for LLM rubrics and deterministic checks only — custom code just relies on its assertion
 *     name) the exact rubric/check value it was judged against, plus the full reasoning text, all
 *     at once. A Passed/Failed/N-A filter (mirroring the table's Assertions column header filter)
 *     lets a row with many assertions be scanned down to just the ones that matter right now.
 *   - FOOTER: latency/cost/tokens, collapsed by default (a per-row curiosity, not something worth
 *     permanent screen space).
 * Prev/Next step through `rows` (the table's current sorted/filtered order) without closing the panel.
 */
export function ResultItemPanel({
  rows,
  datasetItemId,
  variableNames,
  assertions,
  allLabels,
  onClose,
  onNavigate,
  onSetLabels,
  onSetNote,
}: {
  rows: ResultRow[];
  datasetItemId: string;
  variableNames: string[];
  assertions: Assertion[];
  allLabels: string[];
  onClose: () => void;
  onNavigate: (datasetItemId: string) => void;
  onSetLabels: (datasetItemId: string, labels: string[]) => void;
  /** Omit to hide the note editor entirely (e.g. read-only comparison contexts). */
  onSetNote?: (datasetItemId: string, note: string) => void;
}) {
  const index = rows.findIndex((r) => r.result.datasetItemId === datasetItemId);
  const row = index >= 0 ? rows[index] : null;
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(row?.item?.note ?? "");
  const [assertionOutcomeFilter, setAssertionOutcomeFilter] = useState<AssertionOutcomeFilter>("all");

  useEffect(() => {
    setNoteDraft(row?.item?.note ?? "");
  }, [datasetItemId, row?.item?.note]);

  // Resets every time you navigate to a different row (Prev/Next or reopening from the table) —
  // a filter left on "Failed" from the last row would otherwise silently hide everything on the
  // next one if it happened to have passed cleanly.
  useEffect(() => {
    setAssertionOutcomeFilter("all");
  }, [datasetItemId]);

  if (!row) return null;
  const { result, item, failCount, passCount, naCount, status } = row;
  const allPass = status === "passed";
  const assertionMap = new Map(flattenAssertions(assertions).map((a) => [a.id, a]));
  const values = item ? resolveDatasetItemValues(item, variableNames) : {};

  function saveNote() {
    if (item && onSetNote && noteDraft !== (item.note ?? "")) onSetNote(item.id, noteDraft);
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent width="2xl" showCloseButton={false} className="flex-col">
        <SheetHeader className="flex-col items-stretch gap-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SheetTitle>
                Row {index + 1} of {rows.length}
              </SheetTitle>
              {status === "error" ? (
                <Badge tone="warning">
                  <AlertTriangle size={11} /> Error
                </Badge>
              ) : (
                <Badge tone={allPass ? "success" : "danger"}>
                  {allPass ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                  {passCount}/{passCount + failCount} passed
                  {naCount > 0 && <span className="opacity-70"> · {naCount} n/a</span>}
                </Badge>
              )}
              {item && <DatasetSourceIcon source={item.source} size={15} />}
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
        </SheetHeader>

        <div className="flex min-h-0 flex-1 divide-x divide-slate-200">
          {/* LEFT — pinned context: what actually happened on this row. */}
          <div className="min-h-0 w-[46%] shrink-0 overflow-y-auto p-4">
            <div className="space-y-5">
              {status === "error" && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">The generation call failed before any assertion could run.</p>
                    {result.error && <p className="mt-0.5 text-amber-700">{result.error}</p>}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Input</h4>
                <div className="space-y-2">
                  {variableNames.length > 0 ? (
                    variableNames.map((name) => (
                      <div key={name} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                        {variableNames.length > 1 && (
                          <label className="mb-1 block font-mono text-[10px] text-primary">{`{${name}}`}</label>
                        )}
                        <p className="whitespace-pre-wrap break-words text-xs text-slate-800">{tryPrettyPrintText(values[name] || "") || "—"}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs italic text-slate-400">No dataset row found for this result (it may have been deleted).</p>
                  )}
                </div>
              </div>

              <div className="space-y-2 border-t border-slate-200 pt-4">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Output</h4>
                {status === "error" ? (
                  <p className="text-xs italic text-slate-400">No output — the call errored.</p>
                ) : (
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800">
                    {tryPrettyPrintText(result.output || "") || "—"}
                  </pre>
                )}
              </div>

              <div className="space-y-2 border-t border-slate-200 pt-4">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Reference Output</h4>
                {item?.expectedOutput ? (
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800">
                    {tryPrettyPrintText(item.expectedOutput)}
                  </pre>
                ) : (
                  <p className="text-xs italic text-slate-400">No reference output set for this row.</p>
                )}
              </div>

              {item && (
                <div className="space-y-2 border-t border-slate-200 pt-4">
                  <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <StickyNote size={12} /> Reviewer note
                  </h4>
                  {onSetNote ? (
                    <textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      onBlur={saveNote}
                      placeholder="What's wrong or notable about this test case? (persists across reruns)"
                      rows={3}
                      className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800 outline-none focus:border-ring"
                    />
                  ) : item.note ? (
                    <p className="whitespace-pre-wrap break-words rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                      {item.note}
                    </p>
                  ) : (
                    <p className="text-xs italic text-slate-400">No note on this row.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — every assertion, expanded, always visible alongside the output on the left. */}
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Assertions {status !== "error" && `(${passCount + failCount + naCount})`}
              </h4>
              {status !== "error" && result.scores.length > 0 && (
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
            <div className="space-y-2">
              {status === "error" && <p className="text-xs italic text-slate-400">No assertions ran for this row.</p>}
              {status !== "error" && result.scores.length === 0 && (
                <p className="text-xs italic text-slate-400">No assertions were run for this row.</p>
              )}
              {status !== "error" &&
                result.scores.length > 0 &&
                !result.scores.some((sc) => matchesAssertionOutcomeFilter(sc, assertionOutcomeFilter)) && (
                  <p className="text-xs italic text-slate-400">No assertions match this filter.</p>
                )}
              {result.scores.filter((sc) => matchesAssertionOutcomeFilter(sc, assertionOutcomeFilter)).map((sc) => {
                const assertion = assertionMap.get(sc.assertionId);
                return (
                  <div
                    key={sc.assertionId}
                    className={`rounded-lg border p-2.5 ${sc.na ? "border-slate-200 bg-slate-50/60" : "border-slate-200 bg-slate-50"} border-l-[3px] ${assertionAccentBorder(assertion)}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        {sc.na ? (
                          <Minus size={13} className="mt-0.5 shrink-0 text-slate-400" />
                        ) : sc.passed ? (
                          <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" />
                        ) : (
                          <XCircle size={13} className="mt-0.5 shrink-0 text-rose-600" />
                        )}
                        <div>
                          <p className="text-xs font-medium text-slate-800">{assertion?.description ?? "(deleted assertion)"}</p>
                          {assertion?.group && <p className="text-[10px] uppercase tracking-wide text-slate-400">{assertion.group}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {assertion && <Badge tone={assertionTypeTone(assertion)}>{assertionTypeLabel(assertion)}</Badge>}
                        {sc.na ? (
                          <Badge tone="neutral">n/a</Badge>
                        ) : (
                          sc.score !== undefined && <Badge tone={sc.passed ? "success" : "danger"}>{sc.score.toFixed(2)}</Badge>
                        )}
                      </div>
                    </div>
                    {/* Only LLM rubrics and deterministic checks get a "what was this judged against"
                        box. Custom-code assertions deliberately show nothing here — per Veronica, the
                        assertion name above should already say what the code checks, and the source
                        itself isn't useful context in the review panel. Composite/grouped assertions
                        (assert-set) get their own threshold callout instead, further below. */}
                    {!assertion?.children?.length && assertion?.tier === "rubric_grading" && (
                      <div className="mt-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Rubric</p>
                        <RubricText text={assertion.rubric?.trim() || "—"} />
                      </div>
                    )}
                    {!assertion?.children?.length && assertion?.tier === "deterministic" && (
                      <div className="mt-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Check</p>
                        <p className="mt-0.5 whitespace-pre-wrap break-words text-[11px] text-slate-600">
                          {assertion.check ? checkValueDisplay(assertion.check) : "—"}
                        </p>
                      </div>
                    )}
                    {assertion?.children && assertion.children.length > 0 && (
                      <p className="mt-1.5 text-[10px] text-slate-400">
                        Passes when the weighted average of its {assertion.children.length} sub-checks reaches{" "}
                        <span className="font-medium text-slate-600">{(assertion.groupThreshold ?? 0.5).toFixed(2)}</span>.
                      </p>
                    )}
                    <p className={`mt-1.5 text-xs ${sc.na ? "italic text-slate-400" : sc.passed ? "text-slate-600" : "text-rose-700"}`}>
                      {sc.na ? sc.reason || "Not applicable to this row." : sc.reason}
                    </p>
                    {/* Full breakdown behind a group's weighted score — each child was scored by its own
                        tier (see `scoreAssertionGroup` in engine.ts) and never lives in `result.scores`
                        itself, so it can't double-count in any rollup; this is the only place it's shown. */}
                    {sc.childScores && sc.childScores.length > 0 && (
                      <div className="mt-2 space-y-1.5 border-t border-slate-200 pt-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Sub-checks ({sc.childScores.length})
                        </p>
                        {sc.childScores.map((child) => {
                          const childAssertion = assertionMap.get(child.assertionId);
                          return (
                            <div key={child.assertionId} className="flex items-start gap-2 rounded-md bg-white px-2 py-1.5">
                              {child.passed ? (
                                <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-600" />
                              ) : (
                                <XCircle size={12} className="mt-0.5 shrink-0 text-rose-600" />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="truncate text-[11px] font-medium text-slate-700">
                                    {childAssertion?.description ?? "Sub-check"}
                                  </p>
                                  <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                                    {child.score !== undefined ? child.score.toFixed(2) : child.passed ? "pass" : "fail"}
                                    {childAssertion?.weight !== undefined && childAssertion.weight !== 1 ? ` ×${childAssertion.weight}` : ""}
                                  </span>
                                </div>
                                <p className={`text-[10px] ${child.passed ? "text-slate-500" : "text-rose-600"}`}>{child.reason}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* FOOTER — collapsible metadata, off by default; a per-row curiosity, not worth permanent space. */}
        <div className="shrink-0 border-t border-slate-200">
          <button
            onClick={() => setMetadataOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2 text-[11px] font-medium text-slate-500 hover:text-slate-800"
          >
            <span className="flex items-center gap-1.5">
              Metadata
              <span className="font-normal text-slate-400">
                {formatLatency(result.latencyMs)} · {formatCost(result.costUsd)} · {formatTokens(result.tokenUsage?.totalTokens)} tokens
              </span>
            </span>
            {metadataOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
          {metadataOpen && (
            <div className="max-h-48 overflow-auto border-t border-slate-100 px-4 py-2">
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {[
                    { key: "Latency", value: formatLatency(result.latencyMs) },
                    { key: "Cost", value: formatCost(result.costUsd) },
                    {
                      key: "Tokens",
                      value: result.tokenUsage
                        ? `${formatTokens(result.tokenUsage.totalTokens)} (${formatTokens(result.tokenUsage.promptTokens)} in / ${formatTokens(result.tokenUsage.completionTokens)} out)`
                        : formatTokens(undefined),
                    },
                    { key: "Tokens/Sec", value: formatTokens(tokensPerSecond(result.tokenUsage?.completionTokens, result.latencyMs)) },
                    { key: "Row id", value: result.datasetItemId, mono: true },
                  ].map((r) => (
                    <tr key={r.key} className="border-b border-slate-100 last:border-b-0">
                      <td className="w-32 px-1 py-1.5 align-top text-slate-500">{r.key}</td>
                      <td className={`px-1 py-1.5 text-slate-800 ${r.mono ? "break-all font-mono" : "font-medium"}`}>{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

