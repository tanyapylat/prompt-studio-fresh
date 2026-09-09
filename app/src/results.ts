import type { Assertion, DatasetItem, DatasetItemSource, RunGroup, RunItemResult, SpecProject } from "./types";
import { resolveDatasetItemValues } from "./dataset";
import { toCsv } from "./download";

/** One Run row, pre-joined with its Dataset item and fail/pass counts — what the table/panel/summary all render from. */
export interface ResultRow {
  result: RunItemResult;
  item: DatasetItem | undefined;
  failCount: number;
  passCount: number;
}

export function buildResultRows(spec: SpecProject, run: RunGroup): ResultRow[] {
  const byItem = new Map(spec.dataset.map((d) => [d.id, d]));
  return run.results.map((r) => {
    const passCount = r.scores.filter((s) => s.passed).length;
    return { result: r, item: byItem.get(r.datasetItemId), failCount: r.scores.length - passCount, passCount };
  });
}

/**
 * A fresh Run always starts every row's `note`/`labels` empty — copies them forward from the
 * previous Run's result for the same dataset row (when one exists) so re-running a Spec after a
 * prompt tweak doesn't wipe out a reviewer's open-coding. Only fills in what the new run doesn't
 * already have; never overwrites.
 */
export function carryForwardAnnotations(newResults: RunItemResult[], previousRun: RunGroup | undefined): RunItemResult[] {
  if (!previousRun) return newResults;
  const byItem = new Map(previousRun.results.map((r) => [r.datasetItemId, r]));
  return newResults.map((r) => {
    const prev = byItem.get(r.datasetItemId);
    if (!prev) return r;
    return {
      ...r,
      note: r.note ?? prev.note,
      labels: r.labels && r.labels.length > 0 ? r.labels : prev.labels,
    };
  });
}

export type ResultStatusFilter = "all" | "passed" | "failed";

export function matchesStatusFilter(row: ResultRow, filter: ResultStatusFilter): boolean {
  if (filter === "passed") return row.failCount === 0;
  if (filter === "failed") return row.failCount > 0;
  return true;
}

/** Loose, case-insensitive match against input, output, reference output, labels, and the note — good enough for a quick filter, not a real search index. */
export function matchesSearch(row: ResultRow, query: string, variableNames: string[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    row.item?.input,
    row.item?.expectedOutput,
    row.result.output,
    row.result.note,
    ...(row.result.labels ?? []),
    ...(row.item?.variables ? variableNames.map((n) => row.item?.variables?.[n]) : []),
  ]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();
  return haystack.includes(q);
}

/** Sentinel used inside `ResultsFilters.labels` to mean "rows with no labels at all", alongside real label values. */
export const NO_LABEL_FILTER_VALUE = "__none__";

export interface ResultsFilters {
  /** Only one assertion at a time — restrict to rows where it passed/failed. */
  assertionId: string | null;
  assertionOutcome: "failed" | "passed";
  /** OR-matched against each row's labels; `NO_LABEL_FILTER_VALUE` matches rows with zero labels. */
  labels: string[];
  sources: DatasetItemSource[];
  minLatencyMs: number | null;
  maxLatencyMs: number | null;
  minCostUsd: number | null;
  maxCostUsd: number | null;
  hasNote: "any" | "yes" | "no";
  hasReferenceOutput: "any" | "yes" | "no";
}

export const DEFAULT_RESULTS_FILTERS: ResultsFilters = {
  assertionId: null,
  assertionOutcome: "failed",
  labels: [],
  sources: [],
  minLatencyMs: null,
  maxLatencyMs: null,
  minCostUsd: null,
  maxCostUsd: null,
  hasNote: "any",
  hasReferenceOutput: "any",
};

export function countActiveFilters(f: ResultsFilters): number {
  let n = 0;
  if (f.assertionId) n++;
  if (f.labels.length > 0) n++;
  if (f.sources.length > 0) n++;
  if (f.minLatencyMs != null || f.maxLatencyMs != null) n++;
  if (f.minCostUsd != null || f.maxCostUsd != null) n++;
  if (f.hasNote !== "any") n++;
  if (f.hasReferenceOutput !== "any") n++;
  return n;
}

export function matchesFilters(row: ResultRow, filters: ResultsFilters): boolean {
  if (filters.assertionId) {
    const score = row.result.scores.find((s) => s.assertionId === filters.assertionId);
    if (!score) return false;
    if (filters.assertionOutcome === "failed" && score.passed) return false;
    if (filters.assertionOutcome === "passed" && !score.passed) return false;
  }
  if (filters.labels.length > 0) {
    const rowLabels = row.result.labels ?? [];
    const matchesAny = filters.labels.some((l) => (l === NO_LABEL_FILTER_VALUE ? rowLabels.length === 0 : rowLabels.includes(l)));
    if (!matchesAny) return false;
  }
  if (filters.sources.length > 0) {
    if (!row.item || !filters.sources.includes(row.item.source)) return false;
  }
  const latency = row.result.latencyMs;
  if (filters.minLatencyMs != null && (latency === undefined || latency < filters.minLatencyMs)) return false;
  if (filters.maxLatencyMs != null && (latency === undefined || latency > filters.maxLatencyMs)) return false;
  const cost = row.result.costUsd;
  if (filters.minCostUsd != null && (cost === undefined || cost < filters.minCostUsd)) return false;
  if (filters.maxCostUsd != null && (cost === undefined || cost > filters.maxCostUsd)) return false;
  const hasNote = !!row.result.note?.trim();
  if (filters.hasNote === "yes" && !hasNote) return false;
  if (filters.hasNote === "no" && hasNote) return false;
  const hasRef = !!row.item?.expectedOutput;
  if (filters.hasReferenceOutput === "yes" && !hasRef) return false;
  if (filters.hasReferenceOutput === "no" && hasRef) return false;
  return true;
}

/** Every distinct label used anywhere in this Spec's run history — powers the label filter and the inline editor's autocomplete. */
export function collectAllLabels(spec: SpecProject): string[] {
  const set = new Set<string>();
  for (const run of spec.runs) {
    for (const r of run.results) {
      for (const l of r.labels ?? []) set.add(l);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function formatLatency(ms: number | undefined): string {
  if (ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatCost(usd: number | undefined): string {
  if (usd === undefined) return "—";
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

export function averageOf(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function totalOf(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, v) => sum + v, 0);
}

export function assertionById(spec: SpecProject): Map<string, Assertion> {
  return new Map(spec.assertions.map((a) => [a.id, a]));
}

export function resultRowsToJson(rows: ResultRow[], spec: SpecProject, variableNames: string[]): string {
  const assertionMap = assertionById(spec);
  const payload = rows.map(({ result, item, passCount }) => ({
    datasetItemId: result.datasetItemId,
    input: item ? resolveDatasetItemValues(item, variableNames) : {},
    referenceOutput: item?.expectedOutput ?? null,
    output: result.output,
    passed: passCount === result.scores.length,
    checksPassed: passCount,
    checksTotal: result.scores.length,
    scores: result.scores.map((s) => ({
      assertion: assertionMap.get(s.assertionId)?.description ?? "(deleted check)",
      tier: assertionMap.get(s.assertionId)?.tier,
      passed: s.passed,
      score: s.score,
      reason: s.reason,
    })),
    latencyMs: result.latencyMs ?? null,
    costUsd: result.costUsd ?? null,
    labels: result.labels ?? [],
    note: result.note ?? null,
  }));
  return JSON.stringify(payload, null, 2);
}

export function resultRowsToCsv(rows: ResultRow[], variableNames: string[]): string {
  const header = [
    "datasetItemId",
    ...variableNames,
    "output",
    "referenceOutput",
    "passed",
    "checksPassed",
    "checksTotal",
    "latencyMs",
    "costUsd",
    "labels",
    "note",
  ];
  const lines = rows.map(({ result, item, passCount }) => {
    const values = item ? resolveDatasetItemValues(item, variableNames) : {};
    return [
      result.datasetItemId,
      ...variableNames.map((n) => values[n] ?? ""),
      result.output,
      item?.expectedOutput ?? "",
      passCount === result.scores.length ? "true" : "false",
      String(passCount),
      String(result.scores.length),
      result.latencyMs !== undefined ? String(Math.round(result.latencyMs)) : "",
      result.costUsd !== undefined ? result.costUsd.toFixed(6) : "",
      (result.labels ?? []).join("; "),
      result.note ?? "",
    ];
  });
  return toCsv([header, ...lines]);
}
