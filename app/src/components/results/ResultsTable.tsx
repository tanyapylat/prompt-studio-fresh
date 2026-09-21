import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  Filter,
  Layers,
  Search,
  StickyNote,
  XCircle,
} from "lucide-react";
import { resolveDatasetItemValues, tryPrettyPrintText } from "../../dataset";
import { flattenAssertions, formatCost, formatLatency, formatTokens, tokensPerSecond, type ResultRow } from "../../results";
import {
  RESULTS_PAGE_SIZE_OPTIONS,
  type ResultsSortField,
  type ResultsViewPrefs,
} from "../../resultsViewPrefs";
import type { Assertion, DatasetItem } from "../../types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LabelChips } from "./LabelChips";
import { DatasetSourceIcon } from "../dataset/DatasetSourceIcon";

const MIN_COL_WIDTH = 90;

/** Short, chip-friendly label for one assertion — its full text is still available via `title`. */
function assertionChipLabel(assertion: Assertion | undefined): string {
  if (!assertion) return "assertion";
  return assertion.description.length > 22 ? `${assertion.description.slice(0, 21)}…` : assertion.description;
}

function SortHeader({
  label,
  field,
  prefs,
  onSort,
}: {
  label: string;
  field: ResultsSortField;
  prefs: ResultsViewPrefs;
  onSort: (field: ResultsSortField) => void;
}) {
  const active = prefs.sortField === field;
  return (
    <button
      onClick={() => onSort(field)}
      className={`inline-flex items-center gap-1 text-xs font-medium ${active ? "text-slate-800" : "text-slate-500"} hover:text-slate-800`}
    >
      {label}
      {active ? (
        prefs.sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
      ) : (
        <ChevronsUpDown size={12} className="text-slate-300" />
      )}
    </button>
  );
}

/** The persistently-visible drag handle at a column's right edge — thickens/tints on hover or while dragging so it reads as draggable up front, not something you discover by accident. */
function ColResizeHandle({ width, minWidth = MIN_COL_WIDTH, onResize }: { width: number; minWidth?: number; onResize: (w: number) => void }) {
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handlePointerDown(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, startWidth: width };
    setIsDragging(true);
    document.body.style.cursor = "col-resize";

    function handleMove(ev: PointerEvent) {
      if (!dragRef.current) return;
      onResize(Math.max(minWidth, dragRef.current.startWidth + (ev.clientX - dragRef.current.startX)));
    }
    function handleUp() {
      dragRef.current = null;
      setIsDragging(false);
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      title="Drag to resize column"
      className="group absolute inset-y-1 right-0 z-10 flex w-3 cursor-col-resize touch-none select-none items-center justify-center"
    >
      <div
        className={`h-full rounded-full transition-all ${
          isDragging ? "w-1 bg-primary" : "w-px bg-slate-300 group-hover:w-1 group-hover:bg-primary/70"
        }`}
      />
    </div>
  );
}

/**
 * Small filter control living directly in the Assertions column header — lets you collapse that
 * one column to just its failing chips (`prefs.assertionsOnlyFailing`) without opening the Columns
 * menu. Deliberately scoped to this one column (unlike every other view toggle, which lives in
 * the Columns menu) since it's a display option specific to what that column is currently
 * showing, not a whole-table setting.
 */
function AssertionsHeaderFilter({ prefs, onUpdate }: { prefs: ResultsViewPrefs; onUpdate: (patch: Partial<ResultsViewPrefs>) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="Configure which assertions show in this column"
        className={`rounded-md p-0.5 ${prefs.assertionsOnlyFailing ? "text-primary" : "text-slate-400 hover:text-slate-700"}`}
      >
        <Filter size={11} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg shadow-slate-900/10">
            <button
              onClick={() => {
                onUpdate({ assertionsOnlyFailing: false });
                setOpen(false);
              }}
              className={`block w-full px-3 py-1.5 text-left text-xs ${!prefs.assertionsOnlyFailing ? "bg-accent text-accent-foreground" : "text-slate-700 hover:bg-slate-50"}`}
            >
              Show all assertions
            </button>
            <button
              onClick={() => {
                onUpdate({ assertionsOnlyFailing: true });
                setOpen(false);
              }}
              className={`block w-full px-3 py-1.5 text-left text-xs ${prefs.assertionsOnlyFailing ? "bg-accent text-accent-foreground" : "text-slate-700 hover:bg-slate-50"}`}
            >
              Only fails/errors
            </button>
          </div>
        </>
      )}
    </span>
  );
}

/**
 * Renders one row's combined "Inputs" cell distinguishably — bold/tinted `name:` labels with a
 * visible divider between variables in compact mode, or one variable per line in wrap mode —
 * instead of one run-on "name: value  ·  name2: value2" plain string (`datasetItemInputsPreview`),
 * which is genuinely hard to parse once a value itself contains a colon or the row has several
 * variables (e.g. a chat transcript variable next to a short id variable). Falls back to just the
 * raw value when there's only one variable, since there's nothing to distinguish then. Shared with
 * `ComparisonRunBody`'s Inputs column, which has the exact same "one combined cell" shape.
 */
export function CombinedInputsCell({ item, variableNames, wrap }: { item: DatasetItem | undefined; variableNames: string[]; wrap: boolean }) {
  if (!item) return <>—</>;
  if (variableNames.length <= 1) {
    const raw = variableNames[0] ? resolveDatasetItemValues(item, variableNames)[variableNames[0]] : item.input;
    return <>{(wrap ? tryPrettyPrintText(raw || "") : raw) || "—"}</>;
  }
  const values = resolveDatasetItemValues(item, variableNames);
  if (wrap) {
    return (
      <div className="flex flex-col gap-1">
        {variableNames.map((n) => (
          <div key={n} className="whitespace-pre-wrap break-words">
            <span className="font-semibold text-primary/80">{n}:</span> {tryPrettyPrintText(values[n] || "") || "—"}
          </div>
        ))}
      </div>
    );
  }
  return (
    <span className="whitespace-nowrap">
      {variableNames.map((n, i) => (
        <span key={n}>
          {i > 0 && <span className="mx-1.5 text-slate-300">·</span>}
          <span className="font-semibold text-primary/80">{n}:</span> {values[n] || "—"}
        </span>
      ))}
    </span>
  );
}

/**
 * The Results tab's main table — mirrors the Dataset tab's `DatasetTable` (compact/wrapped cells,
 * sortable columns, pagination, configurable columns, row selection), with pass/fail, output,
 * assertions, latency, cost, and an inline-editable Labels column added on top. Full detail
 * (per-assertion reasons, metadata) lives in `ResultItemPanel`, not inline here.
 *
 * Input(s)/Output/Reference Output/Assertions/Labels columns are drag-resizable (a persistent handle
 * at each column's right edge, `table-layout: fixed` + a `<colgroup>` under the hood) with
 * horizontal scroll for whatever doesn't fit — useful once you split multi-variable inputs into
 * one column per variable. Widths reset when this component unmounts (session-only, not a Spec
 * edit worth persisting to localStorage the way column visibility is).
 */
export function ResultsTable({
  rows,
  variableNames,
  prefs,
  onUpdate,
  selectedIds,
  onToggleSelect,
  onBulkSelect,
  onSort,
  onOpenItem,
  onSetLabels,
  allLabels,
  onPageSizeChange,
  assertions,
  onFilterByAssertion,
  activeAssertionId,
  activeAssertionOutcome,
  fullScreen,
}: {
  rows: ResultRow[];
  variableNames: string[];
  prefs: ResultsViewPrefs;
  /** Powers the Assertions column header's own "only fails/errors" filter — see `AssertionsHeaderFilter`. */
  onUpdate: (patch: Partial<ResultsViewPrefs>) => void;
  selectedIds: Set<string>;
  onToggleSelect: (datasetItemId: string) => void;
  onBulkSelect: (ids: string[], selected: boolean) => void;
  onSort: (field: ResultsSortField) => void;
  onOpenItem: (datasetItemId: string) => void;
  onSetLabels: (datasetItemId: string, labels: string[]) => void;
  allLabels: string[];
  onPageSizeChange: (size: number) => void;
  /** Only needed when `prefs.showAssertionChips` is on, to label each chip. */
  assertions?: Assertion[];
  /** Clicking a per-row assertion chip drills into "everything else with this same outcome" — wired to the toolbar's Filters popover. */
  onFilterByAssertion?: (assertionId: string, outcome: "passed" | "failed") => void;
  activeAssertionId?: string | null;
  activeAssertionOutcome?: "passed" | "failed";
  /** Lets the table claim a lot more vertical room while the caller's own full-screen overlay is open — otherwise the "full screen" toggle barely looks different (same capped `max-h-[70vh]` either way). */
  fullScreen?: boolean;
}) {
  const [page, setPage] = useState(0);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const assertionMap = new Map(flattenAssertions(assertions ?? []).map((a) => [a.id, a]));
  // Tracks the scroll wrapper's actual rendered width so the table can stretch a trailing filler
  // column to fill it (see `fillerWidth` below) instead of leaving a dead strip of whitespace once
  // enough columns are hidden/narrow that their total no longer reaches the container's width.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) setContainerWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const totalPages = Math.max(1, Math.ceil(rows.length / prefs.pageSize));
  const clampedPage = Math.min(page, totalPages - 1);
  useEffect(() => {
    if (page !== clampedPage) setPage(clampedPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedPage]);

  const start = clampedPage * prefs.pageSize;
  const pageRows = rows.slice(start, start + prefs.pageSize);
  const pageIds = pageRows.map((r) => r.result.datasetItemId);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  const showSource = !prefs.hiddenColumns.includes("source");
  const showOutput = !prefs.hiddenColumns.includes("output");
  const showReferenceOutput = !prefs.hiddenColumns.includes("referenceOutput");
  const showAssertions = !prefs.hiddenColumns.includes("assertions");
  const showLatency = !prefs.hiddenColumns.includes("latency");
  const showCost = !prefs.hiddenColumns.includes("cost");
  const showTokens = !prefs.hiddenColumns.includes("tokens");
  const showLabels = !prefs.hiddenColumns.includes("labels");
  const splitInputs = prefs.splitInputColumns && variableNames.length > 1;
  const inputColumns = splitInputs ? variableNames : ["__combined__"];

  const cellTextClass = prefs.wrap
    ? "whitespace-pre-wrap break-words align-top"
    : "truncate whitespace-nowrap align-top";

  function widthOf(key: string, fallback: number): number {
    return Math.max(MIN_COL_WIDTH, colWidths[key] ?? fallback);
  }
  function setColWidth(key: string, width: number) {
    setColWidths((prev) => ({ ...prev, [key]: width }));
  }

  // Wider default than most columns — this is where the substance of a row lives (one chip per
  // assertion, plus reasons in wrap mode), so it shouldn't be squeezed to the same width as, say,
  // Labels (which is mostly empty until you actually tag something). A run with a dozen-plus
  // assertions per row (per Veronica's real data) needs real room for this by default, not just
  // "a bit more than before."
  const assertionsDefaultWidth = prefs.showAssertionChips ? 460 : 220;

  // Every visible column's actual rendered width, in table order — drives both the `<colgroup>`
  // and (crucially) the table's own total width. Without an explicit total, a `table-layout:
  // fixed` table with `width: auto` still stretches to fill its container per the CSS spec ("used
  // width is the greater of the containing block's width and the sum of column widths"), which
  // silently blows up whichever flexible column comes last (e.g. Inputs) to fill all the leftover
  // space — exactly the "unreadable, one giant column" bug. Pinning `width` to this sum keeps
  // every column at its real (default or dragged) size and lets the wrapper's horizontal scroll
  // take over once they no longer fit, instead of the browser inventing extra width to give away.
  const colSpecs: { key: string; width: number }[] = [
    { key: "select", width: 36 },
    { key: "rowNumber", width: 40 },
    { key: "status", width: 48 },
    ...(showSource ? [{ key: "source", width: widthOf("source", 56) }] : []),
    ...inputColumns.map((col) => ({ key: `input:${col}`, width: widthOf(`input:${col}`, 220) })),
    ...(showOutput ? [{ key: "output", width: widthOf("output", 220) }] : []),
    ...(showReferenceOutput ? [{ key: "referenceOutput", width: widthOf("referenceOutput", 200) }] : []),
    ...(showAssertions ? [{ key: "assertions", width: widthOf("assertions", assertionsDefaultWidth) }] : []),
    ...(showLatency ? [{ key: "latency", width: 90 }] : []),
    ...(showCost ? [{ key: "cost", width: 80 }] : []),
    ...(showTokens ? [{ key: "tokens", width: 100 }] : []),
    // Narrower default than Assertions — Labels starts out empty for most rows, so it shouldn't
    // claim as much width as the column that actually carries the pass/fail substance.
    ...(showLabels ? [{ key: "labels", width: widthOf("labels", 130) }] : []),
    { key: "actions", width: 36 },
  ];
  const totalTableWidth = colSpecs.reduce((sum, c) => sum + c.width, 0);
  const columnCount = colSpecs.length;
  // A trailing, purely decorative column that soaks up whatever width the real columns don't need
  // — keeps every real column at its exact fixed/dragged size (avoiding the "table-layout: fixed
  // blows up the last real column to fill the container" bug `totalTableWidth` was introduced to
  // avoid) while still letting the table reach edge-to-edge instead of leaving dead whitespace.
  const fillerWidth = Math.max(0, containerWidth - totalTableWidth);

  function handleChipClick(e: React.MouseEvent, assertionId: string, outcome: "passed" | "failed") {
    e.stopPropagation();
    onFilterByAssertion?.(assertionId, outcome);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div ref={scrollRef} className={fullScreen ? "max-h-[calc(100vh-220px)] overflow-auto" : "max-h-[70vh] overflow-auto"}>
        <table className="border-collapse text-left text-xs" style={{ tableLayout: "fixed", width: totalTableWidth + fillerWidth }}>
          <colgroup>
            {colSpecs.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
            <col key="filler" style={{ width: fillerWidth }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <th className="border-b border-slate-200 bg-slate-50 px-2.5 py-2">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={() => onBulkSelect(pageIds, !allPageSelected)}
                  className="size-3.5 accent-primary"
                  title="Select all rows on this page"
                />
              </th>
              <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-right text-xs font-medium text-slate-400">#</th>
              {/* Shortened from "Status"/"Source" — both cells below are icon-only already, so the
                  full word was pure overhead squeezing out the columns that actually matter
                  (Inputs/Output/Assertions); full word still available via `title` on hover. */}
              <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-xs font-medium text-slate-500" title="Status">
                St.
              </th>
              {showSource && (
                <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-xs font-medium text-slate-500" title="Source">
                  Src.
                </th>
              )}
              {inputColumns.map((col) => (
                <th key={col} className="relative border-b border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-500">
                  <div className="truncate pr-2.5">{col === "__combined__" ? "Inputs" : `{${col}}`}</div>
                  <ColResizeHandle width={widthOf(`input:${col}`, 220)} onResize={(w) => setColWidth(`input:${col}`, w)} />
                </th>
              ))}
              {showOutput && (
                <th className="relative border-b border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-500">
                  <div className="truncate pr-2.5">Output</div>
                  <ColResizeHandle width={widthOf("output", 220)} onResize={(w) => setColWidth("output", w)} />
                </th>
              )}
              {showReferenceOutput && (
                <th className="relative border-b border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-500">
                  <div className="truncate pr-2.5">Reference Output</div>
                  <ColResizeHandle width={widthOf("referenceOutput", 200)} onResize={(w) => setColWidth("referenceOutput", w)} />
                </th>
              )}
              {showAssertions && (
                <th className="relative border-b border-slate-200 bg-slate-50 px-2.5 py-2">
                  <div className="flex items-center gap-1 pr-2.5">
                    <SortHeader label="Assertions" field="failCount" prefs={prefs} onSort={onSort} />
                    <AssertionsHeaderFilter prefs={prefs} onUpdate={onUpdate} />
                  </div>
                  <ColResizeHandle width={widthOf("assertions", assertionsDefaultWidth)} onResize={(w) => setColWidth("assertions", w)} />
                </th>
              )}
              {showLatency && (
                <th className="border-b border-slate-200 bg-slate-50 px-2.5 py-2">
                  <SortHeader label="Latency" field="latencyMs" prefs={prefs} onSort={onSort} />
                </th>
              )}
              {showCost && (
                <th className="border-b border-slate-200 bg-slate-50 px-2.5 py-2">
                  <SortHeader label="Cost" field="costUsd" prefs={prefs} onSort={onSort} />
                </th>
              )}
              {showTokens && (
                <th className="border-b border-slate-200 bg-slate-50 px-2.5 py-2">
                  <SortHeader label="Tokens" field="tokens" prefs={prefs} onSort={onSort} />
                </th>
              )}
              {showLabels && (
                <th className="relative border-b border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-500">
                  <div className="truncate pr-2.5">Labels</div>
                  <ColResizeHandle width={widthOf("labels", 180)} onResize={(w) => setColWidth("labels", w)} />
                </th>
              )}
              <th className="border-b border-slate-200 bg-slate-50 px-2 py-2" />
              {/* Filler column's own header cell — must exist so header/body cell counts line up positionally with the `<colgroup>` above. */}
              <th className="border-b border-slate-200 bg-slate-50" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, rowIndex) => {
              const { result, item, failCount, status } = row;
              const passCount = row.passCount;
              const values = item ? resolveDatasetItemValues(item, variableNames) : {};
              const allPass = failCount === 0 && status !== "error";
              const hasNote = !!item?.note?.trim();
              const tps = result.tokenUsage ? tokensPerSecond(result.tokenUsage.completionTokens, result.latencyMs) : undefined;
              return (
                <tr
                  key={result.datasetItemId}
                  onClick={() => onOpenItem(result.datasetItemId)}
                  className="cursor-pointer odd:bg-white even:bg-slate-50/50 hover:bg-accent/60"
                >
                  {/* `align-top` on every cell here — a tall row (e.g. many stacked Assertions chips)
                      would otherwise leave the checkbox/#/Status/Source cells vertically centered
                      by the browser's default `td` alignment, floating away from the rest of the
                      row's content, which all starts at the top instead. */}
                  <td className="border-b border-slate-100 px-2.5 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(result.datasetItemId)}
                      onChange={() => onToggleSelect(result.datasetItemId)}
                      className="size-3.5 accent-primary"
                    />
                  </td>
                  <td className="border-b border-slate-100 px-2 py-2 text-right align-top tabular-nums text-slate-400">
                    {start + rowIndex + 1}
                  </td>
                  <td className="border-b border-slate-100 px-2.5 py-2 align-top">
                    <div className="flex items-center gap-1">
                      {status === "error" ? (
                        <span title={result.error || "Error"}>
                          <AlertTriangle size={15} className="shrink-0 text-amber-600" />
                        </span>
                      ) : allPass ? (
                        <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
                      ) : (
                        <XCircle size={15} className="shrink-0 text-rose-600" />
                      )}
                      {hasNote && (
                        <span title={item!.note}>
                          <StickyNote size={12} className="shrink-0 text-amber-500" />
                        </span>
                      )}
                    </div>
                  </td>
                  {showSource && (
                    <td className="border-b border-slate-100 px-2.5 py-2 align-top">
                      {item ? <DatasetSourceIcon source={item.source} /> : "—"}
                    </td>
                  )}
                  {inputColumns.map((col) => {
                    if (col === "__combined__") {
                      return (
                        <td key={col} className={`overflow-hidden border-b border-slate-100 px-2.5 py-2 text-slate-700 ${cellTextClass}`}>
                          <CombinedInputsCell item={item} variableNames={variableNames} wrap={prefs.wrap} />
                        </td>
                      );
                    }
                    const raw = item ? values[col] : "";
                    const text = prefs.wrap ? tryPrettyPrintText(raw || "") : raw;
                    return (
                      <td key={col} className={`overflow-hidden border-b border-slate-100 px-2.5 py-2 text-slate-700 ${cellTextClass}`}>
                        {text || "—"}
                      </td>
                    );
                  })}
                  {showOutput && (
                    <td className={`overflow-hidden border-b border-slate-100 px-2.5 py-2 ${cellTextClass} ${status === "error" ? "text-amber-700" : "text-slate-700"}`}>
                      {status === "error"
                        ? result.error || "Generation errored"
                        : (prefs.wrap ? tryPrettyPrintText(result.output || "") : result.output) || "—"}
                    </td>
                  )}
                  {showReferenceOutput && (
                    <td className={`overflow-hidden border-b border-slate-100 px-2.5 py-2 ${cellTextClass}`}>
                      {item?.expectedOutput ? (
                        <span className="text-slate-700">{prefs.wrap ? tryPrettyPrintText(item.expectedOutput) : item.expectedOutput}</span>
                      ) : (
                        <span className="italic text-slate-400">No output</span>
                      )}
                    </td>
                  )}
                  {showAssertions && (
                    <td className="overflow-hidden border-b border-slate-100 px-2.5 py-2 align-top">
                      {status === "error" ? (
                        <span className="text-[11px] italic text-amber-600">Errored before assertions ran</span>
                      ) : prefs.showAssertionChips ? (
                        <div className="flex flex-col gap-1.5">
                          {(prefs.assertionsOnlyFailing ? result.scores.filter((sc) => !sc.na && !sc.passed) : result.scores).map((sc) => {
                            const assertion = assertionMap.get(sc.assertionId);
                            if (sc.na) {
                              return (
                                <span
                                  key={sc.assertionId}
                                  title={`${assertion?.description ?? "assertion"} — not applicable to this row`}
                                  className="inline-flex w-fit max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 whitespace-nowrap"
                                >
                                  <span className="truncate">{assertionChipLabel(assertion)}</span>
                                  <span className="shrink-0">n/a</span>
                                </span>
                              );
                            }
                            const outcome: "passed" | "failed" = sc.passed ? "passed" : "failed";
                            const isActive = activeAssertionId === sc.assertionId && activeAssertionOutcome === outcome;
                            // Rubric text folded into the hover tooltip here — this compact chip has no
                            // room to show it inline (see the always-visible "Rubric" line in
                            // `ResultItemPanel`'s full detail view instead).
                            const rubricHint = assertion?.tier === "rubric_grading" && assertion.rubric?.trim() ? `\nRubric: ${assertion.rubric.trim()}` : "";
                            return (
                              <div key={sc.assertionId} className="flex flex-col gap-0.5">
                                <button
                                  type="button"
                                  onClick={(e) => handleChipClick(e, sc.assertionId, outcome)}
                                  title={`${assertion?.description ?? "assertion"}${rubricHint}\n\nClick to filter by this assertion`}
                                  className={`inline-flex w-fit max-w-full items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap transition-colors ${
                                    sc.errored
                                      ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                      : sc.passed
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                        : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                  } ${isActive ? "ring-2 ring-primary ring-offset-1" : ""}`}
                                >
                                  <span className="truncate">{assertionChipLabel(assertion)}</span>
                                  {/* Composite/grouped assertion (promptfoo's assert-set — see `Assertion.children`) —
                                      the chip itself still shows the group's own weighted score, this icon is just
                                      what distinguishes it from a single check at a glance. */}
                                  {sc.childScores && sc.childScores.length > 0 && (
                                    <Layers size={9} className="shrink-0 opacity-70" />
                                  )}
                                  {sc.score !== undefined && <span className="shrink-0 tabular-nums opacity-70">{sc.score.toFixed(2)}</span>}
                                </button>
                                {prefs.wrap && (
                                  <p
                                    className={`whitespace-pre-wrap break-words pl-1 text-[10px] ${
                                      sc.errored ? "text-amber-600" : sc.passed ? "text-slate-500" : "text-rose-600"
                                    }`}
                                  >
                                    {sc.reason}
                                  </p>
                                )}
                                {/* Full breakdown behind a group's weighted score — each child scored by its own
                                    tier (see `scoreAssertionGroup` in engine.ts), never double-counted in any
                                    rollup since only the parent's score lives in `result.scores`. */}
                                {prefs.wrap && sc.childScores && sc.childScores.length > 0 && (
                                  <div className="ml-1 flex flex-col gap-0.5 border-l border-slate-200 pl-2">
                                    {sc.childScores.map((child) => {
                                      const childAssertion = assertionMap.get(child.assertionId);
                                      return (
                                        <p
                                          key={child.assertionId}
                                          className={`whitespace-pre-wrap break-words text-[10px] ${
                                            child.errored ? "text-amber-600" : child.passed ? "text-slate-500" : "text-rose-600"
                                          }`}
                                        >
                                          <span className="font-medium">{childAssertion?.description ?? "sub-check"}</span>
                                          {child.score !== undefined && <span className="tabular-nums opacity-70"> ({child.score.toFixed(2)})</span>}: {child.reason}
                                        </p>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {result.scores.length === 0 && <span className="text-slate-400">—</span>}
                          {result.scores.length > 0 && prefs.assertionsOnlyFailing && result.scores.every((sc) => sc.na || sc.passed) && (
                            <span className="text-[10px] italic text-slate-400">All assertions passed</span>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <Badge tone={allPass ? "success" : "danger"}>
                            {passCount}/{passCount + failCount} passed
                          </Badge>
                          {/* Chips are off, but full/wrap view is still supposed to surface *why* a row failed
                              (promptfoo parity) — show each failing assertion's reason under the aggregate badge
                              instead of going silent just because the per-assertion chip breakdown is hidden. */}
                          {prefs.wrap && !allPass && (
                            <div className="flex flex-col gap-1 pl-0.5">
                              {result.scores
                                .filter((sc) => !sc.passed && !sc.na)
                                .map((sc) => (
                                  <p key={sc.assertionId} className="whitespace-pre-wrap break-words text-[10px] text-rose-600">
                                    <span className="font-medium">{assertionChipLabel(assertionMap.get(sc.assertionId))}:</span> {sc.reason}
                                  </p>
                                ))}
                            </div>
                          )}
                        </div>
                      )}
                      {/* Promptfoo-style fallback: latency/cost/tokens are hidden as columns by
                          default (per Veronica's brief), but rather than lose that data entirely,
                          fold whichever of the three is currently hidden into a compact footer line
                          here — same idea as Promptfoo tucking per-cell stats under the output. Only
                          the hidden ones show, so nothing is ever shown twice. */}
                      {status !== "error" && (!showLatency || !showCost || !showTokens) && (
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-slate-100 pt-1 text-[10px] text-slate-400">
                          {!showLatency && <span>{formatLatency(result.latencyMs)}</span>}
                          {!showCost && <span>{formatCost(result.costUsd)}</span>}
                          {!showTokens && result.tokenUsage && (
                            <span title={tps !== undefined ? `${tps.toFixed(0)} tok/s` : undefined}>
                              {formatTokens(result.tokenUsage.promptTokens)}→{formatTokens(result.tokenUsage.completionTokens)} tok
                            </span>
                          )}
                        </p>
                      )}
                    </td>
                  )}
                  {showLatency && (
                    <td className="border-b border-slate-100 px-2.5 py-2 align-top whitespace-nowrap text-slate-500">
                      {formatLatency(result.latencyMs)}
                    </td>
                  )}
                  {showCost && (
                    <td className="border-b border-slate-100 px-2.5 py-2 align-top whitespace-nowrap text-slate-500">
                      {formatCost(result.costUsd)}
                    </td>
                  )}
                  {showTokens && (
                    <td
                      className="border-b border-slate-100 px-2.5 py-2 align-top whitespace-nowrap text-slate-500"
                      title={
                        result.tokenUsage
                          ? `${formatTokens(result.tokenUsage.promptTokens)} in / ${formatTokens(result.tokenUsage.completionTokens)} out`
                          : undefined
                      }
                    >
                      {formatTokens(result.tokenUsage?.totalTokens)}
                      {result.tokenUsage && result.latencyMs !== undefined && (
                        <span className="ml-1 text-[10px] text-slate-400">
                          ({formatTokens(tokensPerSecond(result.tokenUsage.completionTokens, result.latencyMs))}/s)
                        </span>
                      )}
                    </td>
                  )}
                  {showLabels && (
                    <td className="overflow-hidden border-b border-slate-100 px-2 py-1.5 align-top" onClick={(e) => e.stopPropagation()}>
                      <LabelChips
                        labels={result.labels ?? []}
                        suggestions={allLabels}
                        onChange={(next) => onSetLabels(result.datasetItemId, next)}
                        size="sm"
                        placeholder="Add…"
                      />
                    </td>
                  )}
                  <td className="border-b border-slate-100 px-2 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onOpenItem(result.datasetItemId)}
                      title="View details"
                      className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                    >
                      <Search size={14} />
                    </button>
                  </td>
                  <td className="border-b border-slate-100 align-top" />
                </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={columnCount + 1} className="px-3 py-6 text-center text-slate-400">
                  No rows match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <span>
          {rows.length} row{rows.length === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5">
            Show
            <select
              value={prefs.pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                setPage(0);
              }}
              className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-700 outline-none focus:border-ring"
            >
              {RESULTS_PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <span>
            Page {clampedPage + 1} of {totalPages}
          </span>
          <Button size="icon" variant="ghost" disabled={clampedPage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <ChevronLeft size={14} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            disabled={clampedPage >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
