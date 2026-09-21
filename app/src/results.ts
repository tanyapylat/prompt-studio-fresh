import type { Assertion, AssertionTier, DatasetItem, DatasetItemSource, RunGroup, RunItemResult, SpecProject } from "./types";
import type { ResultsColumnId } from "./resultsViewPrefs";
import { resolveDatasetItemValues } from "./dataset";
import { toCsv } from "./download";

/** One Run row, pre-joined with its Dataset item and fail/pass counts — what the table/panel/summary all render from. */
export interface ResultRow {
  result: RunItemResult;
  item: DatasetItem | undefined;
  /** Counts only *applicable* assertions (`score.na` excluded from both this and `passCount`) — an n/a assertion is neither a pass nor a fail. */
  failCount: number;
  passCount: number;
  /** How many of this row's assertions were marked not-applicable — surfaced so "0 fails" can still be distinguished from "everything was n/a". */
  naCount: number;
  status: "passed" | "failed" | "error";
}

export function rowStatus(result: RunItemResult): "passed" | "failed" | "error" {
  if (result.error) return "error";
  const applicable = result.scores.filter((s) => !s.na);
  return applicable.every((s) => s.passed) ? "passed" : "failed";
}

export function buildResultRows(spec: SpecProject, run: RunGroup): ResultRow[] {
  const byItem = new Map(spec.dataset.map((d) => [d.id, d]));
  return run.results.map((r) => {
    const applicable = r.scores.filter((s) => !s.na);
    const passCount = applicable.filter((s) => s.passed).length;
    return {
      result: r,
      item: byItem.get(r.datasetItemId),
      failCount: applicable.length - passCount,
      passCount,
      naCount: r.scores.length - applicable.length,
      status: rowStatus(r),
    };
  });
}

/**
 * A fresh Run always starts every row's `labels` empty — copies them forward from the previous
 * Run's result for the same dataset row (when one exists) so re-running a Spec after a prompt
 * tweak doesn't wipe out a reviewer's triage tags. Only fills in what the new run doesn't already
 * have; never overwrites.
 */
export function carryForwardAnnotations(newResults: RunItemResult[], previousRun: RunGroup | undefined): RunItemResult[] {
  if (!previousRun) return newResults;
  const byItem = new Map(previousRun.results.map((r) => [r.datasetItemId, r]));
  return newResults.map((r) => {
    const prev = byItem.get(r.datasetItemId);
    if (!prev) return r;
    return {
      ...r,
      labels: r.labels && r.labels.length > 0 ? r.labels : prev.labels,
    };
  });
}

export type ResultStatusFilter = "all" | "passed" | "failed" | "error";

export function matchesStatusFilter(row: ResultRow, filter: ResultStatusFilter): boolean {
  if (filter === "all") return true;
  return row.status === filter;
}

/** Loose, case-insensitive match against input, output, reference output, labels, the dataset row's note, and assertion reasons — good enough for a quick filter, not a real search index. */
export function matchesSearch(row: ResultRow, query: string, variableNames: string[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    row.item?.input,
    row.item?.expectedOutput,
    row.item?.note,
    row.result.output,
    ...(row.result.labels ?? []),
    ...(row.item?.variables ? variableNames.map((n) => row.item?.variables?.[n]) : []),
    ...row.result.scores.map((s) => s.reason),
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
  /** Restrict to rows with at least one assertion of this tier (deterministic / custom code / LLM rubric) — independent of `assertionId`, which targets one specific assertion instead of a whole tier. */
  assertionTier: AssertionTier | null;
  /** OR-matched against each row's labels; `NO_LABEL_FILTER_VALUE` matches rows with zero labels. */
  labels: string[];
  sources: DatasetItemSource[];
  minLatencyMs: number | null;
  maxLatencyMs: number | null;
  minCostUsd: number | null;
  maxCostUsd: number | null;
  minTokens: number | null;
  maxTokens: number | null;
  hasReferenceOutput: "any" | "yes" | "no";
  /** Restrict to rows whose dataset item has (or doesn't have) a reviewer note — see `DatasetItem.note`. */
  hasNote: "any" | "yes" | "no";
}

export const DEFAULT_RESULTS_FILTERS: ResultsFilters = {
  assertionId: null,
  assertionOutcome: "failed",
  assertionTier: null,
  labels: [],
  sources: [],
  minLatencyMs: null,
  maxLatencyMs: null,
  minCostUsd: null,
  maxCostUsd: null,
  minTokens: null,
  maxTokens: null,
  hasReferenceOutput: "any",
  hasNote: "any",
};

/**
 * Mirrors `matchesFilters`'s `hiddenColumns` gating exactly, so the "N filters active" badge never
 * lies by counting a filter that's currently a no-op because its column is hidden (the same "only
 * filter what's displayed" rule — hide a column and its filter drops out of both the matching AND
 * the count, not just one of the two).
 */
export function countActiveFilters(f: ResultsFilters, hiddenColumns: ResultsColumnId[] = []): number {
  const hidden = new Set(hiddenColumns);
  let n = 0;
  if (f.assertionId && !hidden.has("assertions")) n++;
  if (f.assertionTier && !hidden.has("assertions")) n++;
  if (f.labels.length > 0 && !hidden.has("labels")) n++;
  if (f.sources.length > 0 && !hidden.has("source")) n++;
  if (!hidden.has("latency") && (f.minLatencyMs != null || f.maxLatencyMs != null)) n++;
  if (!hidden.has("cost") && (f.minCostUsd != null || f.maxCostUsd != null)) n++;
  if (!hidden.has("tokens") && (f.minTokens != null || f.maxTokens != null)) n++;
  if (!hidden.has("referenceOutput") && f.hasReferenceOutput !== "any") n++;
  if (f.hasNote !== "any") n++;
  return n;
}

/**
 * `hiddenColumns` makes each dimension below a no-op once its column is hidden, so a filter can
 * never silently narrow the table by something you can no longer see (the "only filter what's
 * displayed" rule) — hiding a column doesn't need to also remember to clear its filter inputs.
 */
export function matchesFilters(
  row: ResultRow,
  filters: ResultsFilters,
  hiddenColumns: ResultsColumnId[] = [],
  assertionTierById?: Map<string, AssertionTier>,
): boolean {
  const hidden = new Set(hiddenColumns);
  if (filters.assertionId && !hidden.has("assertions")) {
    const score = row.result.scores.find((s) => s.assertionId === filters.assertionId);
    if (!score || score.na) return false;
    if (filters.assertionOutcome === "failed" && score.passed) return false;
    if (filters.assertionOutcome === "passed" && !score.passed) return false;
  }
  if (filters.assertionTier && !hidden.has("assertions") && assertionTierById) {
    const hasTier = row.result.scores.some((s) => !s.na && assertionTierById.get(s.assertionId) === filters.assertionTier);
    if (!hasTier) return false;
  }
  if (filters.hasNote !== "any") {
    const hasNote = !!row.item?.note?.trim();
    if (filters.hasNote === "yes" && !hasNote) return false;
    if (filters.hasNote === "no" && hasNote) return false;
  }
  if (filters.labels.length > 0 && !hidden.has("labels")) {
    const rowLabels = row.result.labels ?? [];
    const matchesAny = filters.labels.some((l) => (l === NO_LABEL_FILTER_VALUE ? rowLabels.length === 0 : rowLabels.includes(l)));
    if (!matchesAny) return false;
  }
  if (filters.sources.length > 0 && !hidden.has("source")) {
    if (!row.item || !filters.sources.includes(row.item.source)) return false;
  }
  if (!hidden.has("latency")) {
    const latency = row.result.latencyMs;
    if (filters.minLatencyMs != null && (latency === undefined || latency < filters.minLatencyMs)) return false;
    if (filters.maxLatencyMs != null && (latency === undefined || latency > filters.maxLatencyMs)) return false;
  }
  if (!hidden.has("cost")) {
    const cost = row.result.costUsd;
    if (filters.minCostUsd != null && (cost === undefined || cost < filters.minCostUsd)) return false;
    if (filters.maxCostUsd != null && (cost === undefined || cost > filters.maxCostUsd)) return false;
  }
  if (!hidden.has("tokens")) {
    const tokens = row.result.tokenUsage?.totalTokens;
    if (filters.minTokens != null && (tokens === undefined || tokens < filters.minTokens)) return false;
    if (filters.maxTokens != null && (tokens === undefined || tokens > filters.maxTokens)) return false;
  }
  if (!hidden.has("referenceOutput")) {
    const hasRef = !!row.item?.expectedOutput;
    if (filters.hasReferenceOutput === "yes" && !hasRef) return false;
    if (filters.hasReferenceOutput === "no" && hasRef) return false;
  }
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

export function formatTokens(n: number | undefined): string {
  if (n === undefined) return "—";
  return Math.round(n).toLocaleString();
}

/** Completion tokens per wall-clock second — promptfoo's "Tokens/Sec", undefined when either input is missing/zero. */
export function tokensPerSecond(completionTokens: number | undefined, latencyMs: number | undefined): number | undefined {
  if (completionTokens === undefined || latencyMs === undefined || latencyMs <= 0) return undefined;
  return completionTokens / (latencyMs / 1000);
}

export function averageOf(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function totalOf(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, v) => sum + v, 0);
}

export function maxOf(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return Math.max(...values);
}

/**
 * Depth-first flatten of a top-level assertion list, including every composite/grouped
 * assertion's `children` — needed anywhere a score's `assertionId` might belong to a child (see
 * `AssertionScore.childScores`) rather than one of `SpecProject.assertions`'s own top-level
 * entries. Rollups (`RunSummary`, filters) should keep iterating the top-level list directly —
 * only *lookups by id* need the flattened version.
 */
export function flattenAssertions(assertions: Assertion[]): Assertion[] {
  return assertions.flatMap((a) => (a.children?.length ? [a, ...flattenAssertions(a.children)] : [a]));
}

export function assertionById(spec: SpecProject): Map<string, Assertion> {
  return new Map(flattenAssertions(spec.assertions).map((a) => [a.id, a]));
}

/** `Assertion.id -> tier` — powers the Filters menu's "Assertion type" (deterministic / custom code / LLM rubric) dimension. */
export function assertionTierById(spec: SpecProject): Map<string, AssertionTier> {
  return new Map(flattenAssertions(spec.assertions).map((a) => [a.id, a.tier]));
}

export function resultRowsToJson(rows: ResultRow[], spec: SpecProject, variableNames: string[]): string {
  const assertionMap = assertionById(spec);
  const payload = rows.map(({ result, item, passCount }) => ({
    datasetItemId: result.datasetItemId,
    input: item ? resolveDatasetItemValues(item, variableNames) : {},
    referenceOutput: item?.expectedOutput ?? null,
    output: result.output,
    passed: passCount === result.scores.length,
    assertionsPassed: passCount,
    assertionsTotal: result.scores.length,
    scores: result.scores.map((s) => ({
      assertion: assertionMap.get(s.assertionId)?.description ?? "(deleted assertion)",
      tier: assertionMap.get(s.assertionId)?.tier,
      passed: s.passed,
      score: s.score,
      reason: s.reason,
    })),
    latencyMs: result.latencyMs ?? null,
    costUsd: result.costUsd ?? null,
    tokenUsage: result.tokenUsage ?? null,
    labels: result.labels ?? [],
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
    "assertionsPassed",
    "assertionsTotal",
    "latencyMs",
    "costUsd",
    "promptTokens",
    "completionTokens",
    "totalTokens",
    "labels",
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
      result.tokenUsage ? String(result.tokenUsage.promptTokens) : "",
      result.tokenUsage ? String(result.tokenUsage.completionTokens) : "",
      result.tokenUsage ? String(result.tokenUsage.totalTokens) : "",
      (result.labels ?? []).join("; "),
    ];
  });
  return toCsv([header, ...lines]);
}

/** One dataset row's result across every compared variant — what `ComparisonRunBody`'s table/panel/charts all render from. */
export interface ComparisonRow {
  item: DatasetItem | undefined;
  datasetItemId: string;
  /** Same order as `run.comparison.variants` — `undefined` only if a variant is missing a result for this row (shouldn't happen for a real comparison run, but keeps the UI from crashing if it does). */
  results: (RunItemResult | undefined)[];
}

export function buildComparisonRows(spec: SpecProject, run: RunGroup): ComparisonRow[] {
  const variants = run.comparison?.variants ?? [];
  const byItem = new Map(spec.dataset.map((d) => [d.id, d]));
  // Row order/identity comes from the first variant — every variant evaluated the same dataset.
  const ids = variants[0]?.results.map((r) => r.datasetItemId) ?? [];
  return ids.map((datasetItemId) => ({
    item: byItem.get(datasetItemId),
    datasetItemId,
    results: variants.map((v) => v.results.find((r) => r.datasetItemId === datasetItemId)),
  }));
}

/** Fraction of *applicable* assertions a variant's result passed on one row — undefined if the result is missing or errored (nothing to score). */
export function variantScoreFraction(result: RunItemResult | undefined): number | undefined {
  if (!result || result.error) return undefined;
  const applicable = result.scores.filter((s) => !s.na);
  if (applicable.length === 0) return undefined;
  return applicable.filter((s) => s.passed).length / applicable.length;
}

/** True when the compared variants don't all agree on overall pass/fail/error for this row — powers the comparison table's "Different only" toggle. */
export function comparisonRowIsDifferent(row: ComparisonRow): boolean {
  const statuses = row.results.map((r) => (r ? rowStatus(r) : "error"));
  return new Set(statuses).size > 1;
}

/**
 * One row's overall status across every variant, "any variant" semantics (Veronica's pick, given
 * "closest to what Different only already implies"): a row is "error" if *any* variant errored
 * (or is missing a result), else "failed" if *any* variant failed, else "passed" (every variant
 * passed). Powers the comparison table's Status filter pills — the single-run equivalent of
 * `ResultRow.status`, just rolled up across variants instead of coming from one result directly.
 */
export function comparisonRowStatus(row: ComparisonRow): "passed" | "failed" | "error" {
  const statuses = row.results.map((r) => (r ? rowStatus(r) : "error"));
  if (statuses.some((s) => s === "error")) return "error";
  if (statuses.some((s) => s === "failed")) return "failed";
  return "passed";
}

/** True if *any* variant's score for `assertionId` matches `outcome` (n/a scores never match either outcome) — same "any variant" semantics as `comparisonRowStatus`. */
export function comparisonRowMatchesAssertion(row: ComparisonRow, assertionId: string, outcome: "passed" | "failed"): boolean {
  return row.results.some((r) => r?.scores.some((s) => s.assertionId === assertionId && !s.na && s.passed === (outcome === "passed")));
}
