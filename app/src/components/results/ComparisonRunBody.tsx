import { Fragment, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Columns3,
  Filter,
  Maximize2,
  Minimize2,
  Search,
  WrapText,
  X,
  XCircle,
  AlertTriangle,
  GitCompare,
} from "lucide-react";
import { useStore } from "../../store";
import type { Assertion, RunGroup, SpecProject } from "../../types";
import { datasetItemInputsPreview, datasetVariableNames, withUpdatedNote } from "../../dataset";
import {
  buildComparisonRows,
  comparisonRowIsDifferent,
  comparisonRowMatchesAssertion,
  comparisonRowStatus,
  variantScoreFraction,
  rowStatus,
  formatCost,
  formatLatency,
  formatTokens,
  type ComparisonRow,
} from "../../results";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatasetSourceIcon } from "../dataset/DatasetSourceIcon";
import { PassRateBarChart, GroupedBarChart, ScatterChart, variantColor } from "./charts";
import { ComparisonItemPanel } from "./ComparisonItemPanel";
import { CombinedInputsCell } from "./ResultsTable";

type ComparisonStatusFilter = "all" | "passed" | "failed" | "error";
const COMPARISON_STATUS_FILTERS: { id: ComparisonStatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "passed", label: "Passed" },
  { id: "failed", label: "Failed" },
  { id: "error", label: "Errors" },
];

/** Per-variant columns beyond the always-on Output/Assertions pair — off by default, same "secondary info, one click away" call as the single-run table's Latency/Cost/Tokens (see `computeAutoHiddenColumns`). */
type ComparisonOptionalColumn = "source" | "latency" | "cost" | "tokens";

/** Loose text match across a comparison row's inputs, note, and every variant's output — the comparison-view equivalent of `matchesSearch`. */
function matchesComparisonSearch(row: ComparisonRow, query: string, variableNames: string[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    row.item?.input,
    row.item?.note,
    ...(row.item?.variables ? variableNames.map((n) => row.item?.variables?.[n]) : []),
    ...row.results.map((r) => r?.output),
  ]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();
  return haystack.includes(q);
}

/**
 * Small "Columns" popover for the comparison table — deliberately its own tiny component (not the
 * single-run `ResultsColumnsMenu`) since the comparison table's optional columns are different:
 * Source is one shared column, but Latency/Cost/Tokens are *per variant* here, not once for the
 * whole row. Session-only (not persisted to `localStorage`), matching this view's other toggles
 * (`wrap`, `chartsOpen`) rather than the single-run table's persisted `ResultsViewPrefs`.
 */
function ComparisonColumnsMenu({ hidden, onToggle }: { hidden: Set<ComparisonOptionalColumn>; onToggle: (col: ComparisonOptionalColumn) => void }) {
  const [open, setOpen] = useState(false);
  const options: { id: ComparisonOptionalColumn; label: string }[] = [
    { id: "source", label: "Source" },
    { id: "latency", label: "Latency (per variant)" },
    { id: "cost", label: "Cost (per variant)" },
    { id: "tokens", label: "Tokens (per variant)" },
  ];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
      >
        <Columns3 size={12} /> Columns <ChevronDown size={11} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg shadow-slate-900/10">
            {options.map((opt) => (
              <label key={opt.id} className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                <input type="checkbox" checked={!hidden.has(opt.id)} onChange={() => onToggle(opt.id)} className="size-3.5 accent-primary" />
                {opt.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Small "Filters" popover for the comparison table — a scoped-down version of the single-run
 * `ResultsFiltersMenu`'s "Assertion" section: which single assertion to filter by, and whether it
 * must have passed or failed on *any* variant (see `comparisonRowMatchesAssertion`).
 */
function ComparisonFiltersMenu({
  assertions,
  assertionId,
  outcome,
  onChange,
}: {
  assertions: Assertion[];
  assertionId: string | null;
  outcome: "passed" | "failed";
  onChange: (patch: { assertionId?: string | null; outcome?: "passed" | "failed" }) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium ${
          assertionId ? "border-primary bg-primary/10 text-primary" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        }`}
      >
        <Filter size={12} /> Assertion filter <ChevronDown size={11} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-64 space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg shadow-slate-900/10">
            <p className="text-xs font-medium text-slate-700">Assertion</p>
            <select
              value={assertionId ?? ""}
              onChange={(e) => onChange({ assertionId: e.target.value || null })}
              className="w-full truncate rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-700 outline-none focus:border-ring"
            >
              <option value="">Any assertion</option>
              {assertions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.description.slice(0, 60)}
                </option>
              ))}
            </select>
            {assertionId && (
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
                {(["failed", "passed"] as const).map((o) => (
                  <button
                    key={o}
                    onClick={() => onChange({ outcome: o })}
                    className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium capitalize ${
                      outcome === o ? "bg-primary text-primary-foreground" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {o} on any variant
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * N-way comparison Run body — Promptfoo-style side-by-side view for a Run that evaluated 2+
 * prompts/targets against the exact same dataset and assertions in one go (`run.comparison`).
 * Distinct from `SingleRunBody` because the whole shape is different: every row now has *one
 * output+assertions per variant* instead of one, and the headline story is "where do the variants
 * disagree", not "how many rows pass overall" — hence the charts (pass rate per variant, pass
 * rate per assertion across variants, and a 2-way agreement scatter when there are exactly 2), the
 * "Different only" filter, and the Status/Assertion filters using "any variant" semantics (see
 * `comparisonRowStatus`) — none of which have a single-run equivalent.
 */
export function ComparisonRunBody({
  spec,
  run,
  toolbarStart,
  toolbarEnd,
}: {
  spec: SpecProject;
  run: RunGroup;
  toolbarStart?: ReactNode;
  toolbarEnd?: ReactNode;
}) {
  const { updateSpec } = useStore();
  const variants = run.comparison!.variants;
  const variableNames = datasetVariableNames(spec.target?.messages);
  const [search, setSearch] = useState("");
  const [differentOnly, setDifferentOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ComparisonStatusFilter>("all");
  const [assertionFilter, setAssertionFilter] = useState<{ assertionId: string | null; outcome: "passed" | "failed" }>({
    assertionId: null,
    outcome: "failed",
  });
  const [hiddenCols, setHiddenCols] = useState<Set<ComparisonOptionalColumn>>(new Set(["latency", "cost", "tokens"]));
  const [wrap, setWrap] = useState(true);
  const [chartsOpen, setChartsOpen] = useState(true);
  const [fullScreen, setFullScreen] = useState(false);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);

  const showSource = !hiddenCols.has("source");
  const showLatency = !hiddenCols.has("latency");
  const showCost = !hiddenCols.has("cost");
  const showTokens = !hiddenCols.has("tokens");
  function toggleCol(col: ComparisonOptionalColumn) {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  }

  const allRows = useMemo(() => buildComparisonRows(spec, run), [spec, run]);
  const filteredRows = useMemo(
    () =>
      allRows.filter(
        (row) =>
          matchesComparisonSearch(row, search, variableNames) &&
          (!differentOnly || comparisonRowIsDifferent(row)) &&
          (statusFilter === "all" || comparisonRowStatus(row) === statusFilter) &&
          (!assertionFilter.assertionId || comparisonRowMatchesAssertion(row, assertionFilter.assertionId, assertionFilter.outcome)),
      ),
    [allRows, search, variableNames, differentOnly, statusFilter, assertionFilter],
  );
  const differentCount = useMemo(() => allRows.filter(comparisonRowIsDifferent).length, [allRows]);

  const assertionStatsByVariant = useMemo(() => {
    // pass rate per assertion, per variant — feeds the grouped bar chart.
    return spec.assertions.map((a) => {
      return variants.map((v) => {
        const scores = v.results.flatMap((r) => r.scores.filter((s) => s.assertionId === a.id && !s.na));
        return scores.length ? scores.filter((s) => s.passed).length / scores.length : 0;
      });
    });
  }, [spec.assertions, variants]);

  const scatterPoints = useMemo(() => {
    if (variants.length !== 2) return [];
    return allRows
      .map((row) => {
        const x = variantScoreFraction(row.results[0]);
        const y = variantScoreFraction(row.results[1]);
        if (x === undefined || y === undefined) return null;
        const agree = rowStatus(row.results[0]!) === rowStatus(row.results[1]!);
        return { x, y, agree, title: row.item ? datasetItemInputsPreview(row.item, variableNames) : row.datasetItemId };
      })
      .filter((p): p is { x: number; y: number; agree: boolean; title: string } => p !== null);
  }, [allRows, variants, variableNames]);

  function patchNote(itemId: string, note: string) {
    updateSpec(spec.id, (s) => ({ ...s, dataset: s.dataset.map((item) => (item.id === itemId ? withUpdatedNote(item, note) : item)) }));
  }

  const content = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <GitCompare size={16} className="text-primary" />
        <p className="text-sm font-semibold text-slate-800">{variants.length}-way comparison</p>
        <p className="text-xs text-slate-500">
          {allRows.length} rows × {spec.assertions.length} assertions, same dataset &amp; assertions across every variant
        </p>
        {differentCount > 0 && (
          <Badge tone="warning" className="ml-1">
            {differentCount} row{differentCount === 1 ? "" : "s"} differ
          </Badge>
        )}
        <span className="flex-1" />
        <Button size="sm" variant={fullScreen ? "default" : "secondary"} onClick={() => setFullScreen((v) => !v)}>
          {fullScreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          {fullScreen ? "Exit full screen" : "Full screen"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {variants.map((v, i) => (
          <div key={v.id} className="flex min-w-[160px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: variantColor(i) }} />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-800" title={v.label}>
                {v.label}
              </p>
              <p className="text-[11px] text-slate-500">
                {Math.round(v.passRate * 100)}% pass · {formatLatency(averageLatency(v.results))} avg · {formatCost(totalCost(v.results))} total
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <button
          onClick={() => setChartsOpen((v) => !v)}
          className="flex w-full items-center justify-between text-xs font-semibold text-slate-800"
        >
          <span className="flex items-center gap-1.5">
            <BarChart3 size={13} /> Charts
          </span>
          <span className="text-[11px] font-normal text-slate-400">{chartsOpen ? "Hide" : "Show"}</span>
        </button>
        {chartsOpen && (
          <div className="mt-3 grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">Pass rate by variant</p>
              <PassRateBarChart labels={variants.map((v) => v.label)} values={variants.map((v) => v.passRate)} />
            </div>
            {variants.length === 2 && scatterPoints.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">Agreement (gray = agree, red = differ)</p>
                <ScatterChart xLabel={variants[0].label} yLabel={variants[1].label} points={scatterPoints} />
              </div>
            )}
            {spec.assertions.length > 0 && (
              <div className="lg:col-span-2">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">Pass rate by assertion</p>
                <GroupedBarChart
                  groupLabels={spec.assertions.map((a) => a.description)}
                  seriesLabels={variants.map((v) => v.label)}
                  values={assertionStatsByVariant}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {toolbarStart}
        <button
          title={wrap ? "Switch to compact view" : "Switch to full (wrapped) view"}
          onClick={() => setWrap((v) => !v)}
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 ${wrap ? "border-primary bg-primary text-primary-foreground" : "border-slate-200 bg-white text-slate-500 hover:text-slate-800"}`}
        >
          <WrapText size={13} />
        </button>
        <div className="relative">
          <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rows…"
            className="w-40 rounded-md border border-slate-200 bg-white py-1 pl-6 pr-2 text-xs text-slate-800 outline-none focus:border-ring"
          />
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
          {COMPARISON_STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              title={f.id === "all" ? undefined : `${f.label} on any variant`}
              className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                statusFilter === f.id ? "bg-primary text-primary-foreground" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <ComparisonFiltersMenu
          assertions={spec.assertions}
          assertionId={assertionFilter.assertionId}
          outcome={assertionFilter.outcome}
          onChange={(patch) => setAssertionFilter((prev) => ({ ...prev, ...patch }))}
        />
        <ComparisonColumnsMenu hidden={hiddenCols} onToggle={toggleCol} />
        <button
          onClick={() => setDifferentOnly((v) => !v)}
          className={`rounded-md px-2 py-1 text-[11px] font-medium ${differentOnly ? "bg-primary text-primary-foreground" : "border border-slate-200 bg-white text-slate-500 hover:text-slate-800"}`}
        >
          Different only ({differentCount})
        </button>
        {toolbarEnd}
        <span className="flex-1" />
        <span className="text-[11px] text-slate-400">{filteredRows.length} of {allRows.length} rows</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        {/* Full screen gets a lot more vertical room than the in-page 70vh cap — otherwise the
            "full screen" toggle barely looks different, same as the single-run table's `fullScreen`
            handling in `ResultsTable`. */}
        <div className={fullScreen ? "max-h-[calc(100vh-260px)] overflow-auto" : "max-h-[70vh] overflow-auto"}>
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                {showSource && <th className="border-b border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-500">Source</th>}
                <th className="w-56 border-b border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-500">Inputs</th>
                {variants.map((v, i) => (
                  <th
                    key={v.id}
                    className="border-b border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-500"
                    colSpan={2 + (showLatency ? 1 : 0) + (showCost ? 1 : 0) + (showTokens ? 1 : 0)}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: variantColor(i) }} />
                      {v.label}
                    </span>
                  </th>
                ))}
              </tr>
              <tr>
                {showSource && <th className="border-b border-slate-200 bg-slate-50 px-2.5 py-1" />}
                <th className="border-b border-slate-200 bg-slate-50 px-2.5 py-1" />
                {variants.map((v) => (
                  <Fragment key={v.id}>
                    <th className="border-b border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-400">
                      Output
                    </th>
                    <th className="border-b border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-400">
                      Assertions
                    </th>
                    {showLatency && <th className="border-b border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-400">Latency</th>}
                    {showCost && <th className="border-b border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-400">Cost</th>}
                    {showTokens && <th className="border-b border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-400">Tokens</th>}
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const isDifferent = comparisonRowIsDifferent(row);
                return (
                  <tr
                    key={row.datasetItemId}
                    onClick={() => setDetailItemId(row.datasetItemId)}
                    className={`cursor-pointer hover:bg-accent/60 ${isDifferent ? "bg-amber-50/60" : "odd:bg-white even:bg-slate-50/50"}`}
                  >
                    {showSource && (
                      <td className="border-b border-slate-100 px-2.5 py-2 align-top">{row.item ? <DatasetSourceIcon source={row.item.source} /> : "—"}</td>
                    )}
                    <td className={`max-w-[220px] overflow-hidden border-b border-slate-100 px-2.5 py-2 align-top text-slate-700 ${wrap ? "whitespace-pre-wrap break-words" : "truncate whitespace-nowrap"}`}>
                      <CombinedInputsCell item={row.item} variableNames={variableNames} wrap={wrap} />
                      {row.item?.note && <div className="mt-1 truncate text-[10px] italic text-amber-600" title={row.item.note}>note: {row.item.note}</div>}
                    </td>
                    {variants.map((_v, i) => {
                      const result = row.results[i];
                      const status = result ? rowStatus(result) : "error";
                      const applicable = result ? result.scores.filter((s) => !s.na) : [];
                      const passCount = applicable.filter((s) => s.passed).length;
                      return (
                        <Fragment key={i}>
                          <td className={`max-w-[240px] overflow-hidden border-b border-slate-100 px-2.5 py-2 align-top text-slate-700 ${wrap ? "whitespace-pre-wrap break-words" : "truncate whitespace-nowrap"}`}>
                            {status === "error" ? <span className="italic text-amber-600">{result?.error || "Errored"}</span> : result?.output || "—"}
                          </td>
                          <td className="border-b border-slate-100 px-2.5 py-2 align-top">
                            {status === "error" ? (
                              <AlertTriangle size={14} className="text-amber-600" />
                            ) : (
                              <Badge tone={status === "passed" ? "success" : "danger"}>
                                {status === "passed" ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                                {passCount}/{applicable.length}
                              </Badge>
                            )}
                            {/* Promptfoo-style fallback: same idea as the single-run table's Assertions
                                column — whichever of Latency/Cost/Tokens is hidden as its own column
                                still shows up here in miniature, instead of disappearing entirely. */}
                            {status !== "error" && (!showLatency || !showCost || !showTokens) && (
                              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-slate-400">
                                {!showLatency && <span>{formatLatency(result?.latencyMs)}</span>}
                                {!showCost && <span>{formatCost(result?.costUsd)}</span>}
                                {!showTokens && result?.tokenUsage && <span>{formatTokens(result.tokenUsage.totalTokens)} tok</span>}
                              </p>
                            )}
                          </td>
                          {showLatency && (
                            <td className="border-b border-slate-100 px-2.5 py-2 align-top text-slate-500">{formatLatency(result?.latencyMs)}</td>
                          )}
                          {showCost && (
                            <td className="border-b border-slate-100 px-2.5 py-2 align-top text-slate-500">{formatCost(result?.costUsd)}</td>
                          )}
                          {showTokens && (
                            <td className="border-b border-slate-100 px-2.5 py-2 align-top text-slate-500">{formatTokens(result?.tokenUsage?.totalTokens)}</td>
                          )}
                        </Fragment>
                      );
                    })}
                  </tr>
                );
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={(showSource ? 1 : 0) + 1 + variants.length * (2 + (showLatency ? 1 : 0) + (showCost ? 1 : 0) + (showTokens ? 1 : 0))}
                    className="px-3 py-6 text-center text-slate-400"
                  >
                    No rows match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detailItemId && (
        <ComparisonItemPanel
          rows={filteredRows}
          datasetItemId={detailItemId}
          variableNames={variableNames}
          variants={variants}
          assertions={spec.assertions}
          onClose={() => setDetailItemId(null)}
          onNavigate={setDetailItemId}
          onSetNote={patchNote}
        />
      )}
    </div>
  );

  if (!fullScreen) return content;
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-white p-4">
      <div className="mb-2 flex justify-end">
        <Button size="sm" variant="secondary" onClick={() => setFullScreen(false)}>
          <X size={12} /> Close full screen
        </Button>
      </div>
      {content}
    </div>
  );
}

function averageLatency(results: { latencyMs?: number }[]): number | undefined {
  const vals = results.map((r) => r.latencyMs).filter((v): v is number => v !== undefined);
  if (vals.length === 0) return undefined;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function totalCost(results: { costUsd?: number }[]): number | undefined {
  const vals = results.map((r) => r.costUsd).filter((v): v is number => v !== undefined);
  if (vals.length === 0) return undefined;
  return vals.reduce((a, b) => a + b, 0);
}
