/**
 * Production-monitoring model for the Observability page: types for online-eval results, plus the
 * pure statistics the page needs (pass rate with an honest confidence range, per-check rates,
 * pooling runs into days, failure grouping, cost estimate). No UI, no I/O — the data comes from
 * `seed/monitoringFixture.generated.ts`, built from real Promptfoo online-eval runs.
 *
 * Runs are stored as small *aggregates* (counts and percentiles), not one row per conversation, so a
 * few hundred runs stay cheap to ship. Chat IDs of failing conversations are kept only for the most
 * recent runs of each config.
 *
 * Requirement IDs in comments (INS-*, VOL-*, ALR-*, …) refer to `vision/production-monitoring-vision.md`.
 */

/** One failing conversation in a run. Content-free: a salted one-way hash of the chat id and the checks it failed. */
export interface FailingChat {
  chat: string;
  failed: string[];
}

/** How many conversations in a run failed exactly this set of checks. */
export interface PatternCount {
  /** Sorted check names; empty when the eval recorded no per-check detail. */
  signature: string[];
  count: number;
}

export interface MonitoringRun {
  /** ISO timestamp the eval run was created. */
  startedAt: string;
  /**
   * Which judge-rubric version graded this run (see `MonitoringFixture.variants`). Undefined on a pooled
   * run that mixes versions.
   */
  variant?: string;
  /** Conversations graded. */
  n: number;
  /** Conversations that passed every check. */
  passed: number;
  uniqueChats: number;
  /** Chats that appear more than once in this run — each extra trace weights that chat more. */
  repeatedChats: number;
  /** Per check: number of conversations that failed it. Checks absent here failed zero times. */
  failedByCheck: Record<string, number>;
  /** Percentiles of production reply time. Meaningless when `timedN` is 0 (older runs did not record it). */
  latency: { p50: number; p95: number };
  /** Conversations that have a recorded reply time. */
  timedN: number;
  /** Total production cost of the graded conversations that have a recorded cost (USD). */
  productionCost: number;
  /** Conversations that have a recorded cost. */
  costedN: number;
  /** Tokens the eval itself spent grading (judge calls) — drives the monitoring-cost estimate. */
  gradingTokens: { prompt: number; completion: number };
  patterns: PatternCount[];
  /** Failing conversations with hashed chat ids. Present only on the most recent runs. */
  failingChats?: FailingChat[];
}

/** A set of runs plotted as one line — everything pooled, or one judge version. */
export interface RunSource {
  id: string;
  label: string;
  runs: MonitoringRun[];
}

/** A distinct set of judge rubrics. Runs with the same check names can still be graded by differently-worded judges. */
export interface JudgeVariant {
  id: string;
  label: string;
}

export interface MonitoringAssertion {
  name: string;
  /** `rule` = deterministic check (cheap); `judge` = graded by an LLM. */
  kind: "rule" | "judge";
}

/** One monitored eval: every online-eval run, oldest first, across all judge versions. */
export interface MonitoringFixture {
  name: string;
  generatedFrom: string;
  assertions: MonitoringAssertion[];
  variants: JudgeVariant[];
  runs: MonitoringRun[];
}

// ---------------------------------------------------------------------------------------------
// Pass rate and honest uncertainty (VOL-3, VOL-4)
// ---------------------------------------------------------------------------------------------

export interface PassRate {
  passed: number;
  total: number;
  /** 0..1 */
  rate: number;
  /** 95% Wilson score interval, 0..1. */
  low: number;
  high: number;
}

/** Wilson score interval — behaves sensibly at small n and at rates near 0% / 100%, unlike ±sqrt(p(1-p)/n). */
export function wilsonInterval(passed: number, total: number, z = 1.96): { low: number; high: number } {
  if (total === 0) return { low: 0, high: 1 };
  const p = passed / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const centre = (p + z2 / (2 * total)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denom;
  return { low: Math.max(0, centre - margin), high: Math.min(1, centre + margin) };
}

export function passRate(passed: number, total: number): PassRate {
  const { low, high } = wilsonInterval(passed, total);
  return { passed, total, rate: total === 0 ? 0 : passed / total, low, high };
}

export function runPassRate(run: MonitoringRun): PassRate {
  return passRate(run.passed, run.n);
}

export function assertionPassRate(run: MonitoringRun, check: string): PassRate {
  return passRate(run.n - (run.failedByCheck[check] ?? 0), run.n);
}

export function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

// ---------------------------------------------------------------------------------------------
// Pooling runs — a day of runs behaves like one bigger run (tighter confidence range)
// ---------------------------------------------------------------------------------------------

/**
 * Merge runs into one aggregate. Counts add exactly. Latency percentiles cannot be merged exactly
 * from percentiles, so they are conversation-weighted averages — good enough for a trend line,
 * and labelled approximate where shown. `uniqueChats` assumes no overlap between runs, which holds
 * in the data (see the `repeatedChats` tile and the build script's cross-run check).
 */
export function poolRuns(runs: MonitoringRun[]): MonitoringRun {
  const n = runs.reduce((s, r) => s + r.n, 0);
  const timedN = runs.reduce((s, r) => s + r.timedN, 0);
  // Only runs that recorded reply times take part, so missing data does not drag the average toward zero.
  const weighted = (pick: (r: MonitoringRun) => number) => (timedN === 0 ? 0 : runs.reduce((s, r) => s + pick(r) * r.timedN, 0) / timedN);

  const failedByCheck: Record<string, number> = {};
  const patterns = new Map<string, PatternCount>();
  for (const r of runs) {
    for (const [k, v] of Object.entries(r.failedByCheck)) failedByCheck[k] = (failedByCheck[k] ?? 0) + v;
    for (const p of r.patterns) {
      const key = p.signature.join("|");
      const existing = patterns.get(key);
      if (existing) existing.count += p.count;
      else patterns.set(key, { signature: p.signature, count: p.count });
    }
  }

  const failingChats = runs.flatMap((r) => r.failingChats ?? []);
  const variants = new Set(runs.map((r) => r.variant));
  return {
    startedAt: runs[0]?.startedAt ?? new Date(0).toISOString(),
    variant: variants.size === 1 ? runs[0]?.variant : undefined,
    n,
    passed: runs.reduce((s, r) => s + r.passed, 0),
    uniqueChats: runs.reduce((s, r) => s + r.uniqueChats, 0),
    repeatedChats: runs.reduce((s, r) => s + r.repeatedChats, 0),
    failedByCheck,
    latency: { p50: weighted((r) => r.latency.p50), p95: weighted((r) => r.latency.p95) },
    timedN,
    productionCost: runs.reduce((s, r) => s + r.productionCost, 0),
    costedN: runs.reduce((s, r) => s + r.costedN, 0),
    gradingTokens: {
      prompt: runs.reduce((s, r) => s + r.gradingTokens.prompt, 0),
      completion: runs.reduce((s, r) => s + r.gradingTokens.completion, 0),
    },
    patterns: [...patterns.values()].sort((a, b) => b.count - a.count),
    failingChats: failingChats.length ? failingChats : undefined,
  };
}

/**
 * Evals created within `windowMs` of each other belong to the same scheduled run (a scheduled run can
 * produce several evals). Returns groups of runs, oldest first.
 */
export function groupBySlot(runs: MonitoringRun[], windowMs = 10 * 60_000): MonitoringRun[][] {
  const sorted = [...runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const groups: MonitoringRun[][] = [];
  for (const r of sorted) {
    const current = groups.at(-1);
    if (current && runTime(r) - runTime(current[0]) <= windowMs) current.push(r);
    else groups.push([r]);
  }
  return groups;
}

export interface DayBucket {
  /** `YYYY-MM-DD`, UTC. */
  day: string;
  /** Midnight UTC of that day, ms. */
  t: number;
  runs: MonitoringRun[];
  pooled: MonitoringRun;
}

const DAY_MS = 86_400_000;

export function runTime(run: MonitoringRun): number {
  return new Date(run.startedAt).getTime();
}

/** Group runs by UTC day, oldest first. Days without runs are omitted. */
export function bucketByDay(runs: MonitoringRun[]): DayBucket[] {
  const byDay = new Map<string, MonitoringRun[]>();
  for (const r of runs) {
    const day = r.startedAt.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), r]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, dayRuns]) => ({ day, t: new Date(`${day}T00:00:00Z`).getTime(), runs: dayRuns, pooled: poolRuns(dayRuns) }));
}

export function runsInRange(runs: MonitoringRun[], fromMs: number, toMs: number): MonitoringRun[] {
  return runs.filter((r) => {
    const t = runTime(r);
    return t >= fromMs && t <= toMs;
  });
}

export const RANGE_PRESETS: { id: string; label: string; days: number | null }[] = [
  { id: "1d", label: "24h", days: 1 },
  { id: "3d", label: "3 days", days: 3 },
  { id: "7d", label: "7 days", days: 7 },
  { id: "14d", label: "14 days", days: 14 },
  { id: "all", label: "All", days: null },
];

export { DAY_MS };

// ---------------------------------------------------------------------------------------------
// Latency and cost (INS-3, IDN-1)
// ---------------------------------------------------------------------------------------------

/** Average production cost of one conversation, or null when no cost was recorded. */
export function costPerConversation(run: MonitoringRun): number | null {
  return run.costedN === 0 ? null : run.productionCost / run.costedN;
}

// ---------------------------------------------------------------------------------------------
// Alert state (ALR-1, ALR-2) — decided against the confidence range, not the bare number
// ---------------------------------------------------------------------------------------------

export type HealthState = "healthy" | "watch" | "alert";

/**
 * `alert` only when the *whole* confidence range is below the threshold (we are confident it is
 * below); `watch` when the number is below but the range still includes the threshold (could be
 * noise at this sample size); otherwise `healthy`.
 */
export function healthState(pr: PassRate, threshold: number): HealthState {
  if (pr.high < threshold) return "alert";
  if (pr.rate < threshold) return "watch";
  return "healthy";
}

/** Mean pass rate of the `window` runs before `index` (null if there are none) — the baseline a drop is judged against. */
export function trailingBaseline(runs: MonitoringRun[], index: number, window = 4): number | null {
  const prior = runs.slice(Math.max(0, index - window), index);
  if (prior.length === 0) return null;
  const n = prior.reduce((s, r) => s + r.n, 0);
  return n === 0 ? null : prior.reduce((s, r) => s + r.passed, 0) / n;
}

/** A run is a *regression* when its whole confidence range sits below the trailing baseline. */
export function isRegression(runs: MonitoringRun[], index: number, window = 4): boolean {
  const baseline = trailingBaseline(runs, index, window);
  if (baseline == null) return false;
  return runPassRate(runs[index]).high < baseline;
}

// ---------------------------------------------------------------------------------------------
// Failure patterns (INS-5)
// ---------------------------------------------------------------------------------------------

export interface FailurePattern {
  /** The set of checks that failed together — a shared signature usually means a shared root cause. */
  signature: string[];
  count: number;
  /** Hashed chat ids; only available for runs that kept them. */
  chats: string[];
}

const signatureKey = (signature: string[]) => signature.join("|");

export function failurePatterns(run: MonitoringRun): FailurePattern[] {
  const chatsBySignature = new Map<string, string[]>();
  for (const fc of run.failingChats ?? []) {
    const key = signatureKey([...fc.failed].sort());
    chatsBySignature.set(key, [...(chatsBySignature.get(key) ?? []), fc.chat]);
  }
  return [...run.patterns]
    .sort((a, b) => b.count - a.count)
    .map((p) => ({ signature: p.signature, count: p.count, chats: chatsBySignature.get(signatureKey(p.signature)) ?? [] }));
}

export interface PatternTrend {
  signature: string[];
  total: number;
  /** Share of all graded conversations in the period. */
  share: number;
  firstSeen: string;
  lastSeen: string;
  /** Failures per bucket, aligned to the buckets passed in. */
  series: number[];
}

/** Failure patterns across a period, with when each first appeared and how often per bucket — new failure modes stand out. */
export function patternTrends(buckets: MonitoringRun[][]): PatternTrend[] {
  const all = buckets.flat();
  const graded = all.reduce((s, r) => s + r.n, 0);
  const map = new Map<string, PatternTrend>();
  buckets.forEach((bucket, i) => {
    for (const r of bucket) {
      for (const p of r.patterns) {
        const key = signatureKey(p.signature);
        let t = map.get(key);
        if (!t) {
          t = { signature: p.signature, total: 0, share: 0, firstSeen: r.startedAt, lastSeen: r.startedAt, series: buckets.map(() => 0) };
          map.set(key, t);
        }
        t.total += p.count;
        t.series[i] += p.count;
        if (r.startedAt < t.firstSeen) t.firstSeen = r.startedAt;
        if (r.startedAt > t.lastSeen) t.lastSeen = r.startedAt;
      }
    }
  });
  return [...map.values()].map((t) => ({ ...t, share: graded === 0 ? 0 : t.total / graded })).sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------------------------------------
// Monitoring settings and cost estimate (CAD-1, VOL-1, GOV-5) — illustrative, not wired to anything
// ---------------------------------------------------------------------------------------------

export interface FrequencyOption {
  id: string;
  label: string;
  hours: number;
}

export const FREQUENCY_OPTIONS: FrequencyOption[] = [
  { id: "15m", label: "Every 15 minutes", hours: 0.25 },
  { id: "1h", label: "Hourly", hours: 1 },
  { id: "6h", label: "Every 6 hours (today)", hours: 6 },
  { id: "24h", label: "Daily", hours: 24 },
  { id: "168h", label: "Weekly", hours: 168 },
];

export interface MonitoringSettingsValue {
  frequencyId: string;
  /** Conversations graded per check. */
  traces: number;
  /** Alert when pass rate falls below this (0..1). */
  threshold: number;
}

export const DEFAULT_MONITORING_SETTINGS: MonitoringSettingsValue = { frequencyId: "6h", traces: 100, threshold: 0.9 };

/** Assumed list price of the grading model — an estimate for scale, not a billing figure. */
export const GRADING_PRICE_PER_1M = { input: 2, output: 8 } as const;

/** Estimated eval-grading cost of one run over `traces` conversations, scaled from a measured run. */
export function estimateRunCostUsd(sample: MonitoringRun, traces: number): number {
  const scale = traces / Math.max(1, sample.n);
  return (
    ((sample.gradingTokens.prompt * scale) / 1_000_000) * GRADING_PRICE_PER_1M.input +
    ((sample.gradingTokens.completion * scale) / 1_000_000) * GRADING_PRICE_PER_1M.output
  );
}

export function estimateMonthlyCostUsd(sample: MonitoringRun, traces: number, frequencyHours: number): number {
  const runsPerMonth = (30 * 24) / frequencyHours;
  return estimateRunCostUsd(sample, traces) * runsPerMonth;
}

export function formatUsd(value: number): string {
  if (value >= 100) return `$${Math.round(value).toLocaleString()}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(3)}`;
}
