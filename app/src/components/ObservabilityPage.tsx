import { useMemo, useState } from "react";
import { Activity, ShieldCheck, ZoomOut } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { variantColor } from "@/components/results/charts";
import { monitoringFixture } from "@/seed/monitoringFixture.generated";
import {
  DAY_MS,
  DEFAULT_MONITORING_SETTINGS,
  RANGE_PRESETS,
  assertionPassRate,
  bucketByDay,
  costPerConversation,
  groupBySlot,
  failurePatterns,
  formatPercent,
  formatUsd,
  healthState,
  isRegression,
  patternTrends,
  poolRuns,
  runPassRate,
  runTime,
  trailingBaseline,
  type HealthState,
  type MonitoringRun,
  type MonitoringSettingsValue,
  type RunSource,
} from "@/monitoring";
import { TrendChart, type TrendSeries } from "@/components/observability/TrendChart";
import { AssertionHeatmap } from "@/components/observability/AssertionHeatmap";
import { FailurePatterns } from "@/components/observability/FailurePatterns";
import { PatternTrends } from "@/components/observability/PatternTrends";
import { RunsTable, type RunRow } from "@/components/observability/RunsTable";
import { MonitoringSettings } from "@/components/observability/MonitoringSettings";

const HEALTH_BADGE: Record<HealthState, { tone: "success" | "warning" | "danger"; label: string; hint: string }> = {
  healthy: { tone: "success", label: "Healthy", hint: "At or above the alert line." },
  watch: {
    tone: "warning",
    label: "Watch",
    hint: "Below the alert line, but the range still reaches it — could be noise at this sample size.",
  },
  alert: { tone: "danger", label: "Alert", hint: "Confidently below the alert line — the whole range is under it." },
};

const fmtDay = (t: number) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const fmtDayTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
const toDateInput = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Small caption tying a section back to the vision doc's requirement IDs. */
function Req({ ids }: { ids: string }) {
  return <span className="ml-2 font-mono text-[10px] font-normal text-slate-300">{ids}</span>;
}

function Tile({ title, children, footer }: { title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Card size="sm">
      <CardContent className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{title}</p>
        {children}
        {footer && <div className="text-xs text-slate-500">{footer}</div>}
      </CardContent>
    </Card>
  );
}

/** One plotted unit: a single run, or a whole day of runs pooled together. */
interface Unit {
  t: number;
  run: MonitoringRun;
  /** Indices into the config's full run list. */
  idxs: number[];
  flagged: boolean;
}

type Granularity = "run" | "day";
interface Selection {
  configId: string;
  idxs: number[];
}

type SeriesMode = "pooled" | "versions";

export function ObservabilityPage() {
  const { runs: allRuns, variants, assertions } = monitoringFixture;

  // One monitored eval. "Pooled" merges the evals of each scheduled run into one run; "By judge version" keeps
  // them apart, because the same checks are graded by differently-worded judge rubrics in different evals.
  const [mode, setMode] = useState<SeriesMode>("pooled");
  const configs: RunSource[] = useMemo(
    () =>
      mode === "pooled"
        ? [{ id: "all", label: monitoringFixture.name, runs: groupBySlot(allRuns).map((g) => (g.length === 1 ? g[0] : poolRuns(g))) }]
        : variants
            .map((v) => ({ id: v.id, label: v.label, runs: allRuns.filter((r) => r.variant === v.id) }))
            .filter((src) => src.runs.length >= 3), // a version with a couple of runs has no trend to draw
    [mode, allRuns, variants],
  );
  const colors = useMemo(() => Object.fromEntries(configs.map((c, i) => [c.id, variantColor(i)])), [configs]);
  const multi = configs.length > 1;
  const variantLabel = (run: MonitoringRun) => variants.find((v) => v.id === run.variant)?.label ?? "Pooled";

  // ----- period -----
  const allTimes = configs.flatMap((c) => c.runs.map(runTime));
  const dataStart = Math.min(...allTimes);
  const dataEnd = Math.max(...allTimes);
  const [presetId, setPresetId] = useState<string>("all");
  const [custom, setCustom] = useState<{ from: number; to: number } | null>(null);
  const [granularity, setGranularity] = useState<Granularity>("day");

  const preset = RANGE_PRESETS.find((p) => p.id === presetId);
  const range = custom ?? {
    from: preset?.days ? Math.max(dataStart, dataEnd - preset.days * DAY_MS) : dataStart,
    to: dataEnd,
  };
  const rangeDays = (range.to - range.from) / DAY_MS;
  // A day or two of data is better read run by run.
  const effectiveGranularity: Granularity = rangeDays < 2.5 ? "run" : granularity;

  const [settings, setSettings] = useState<MonitoringSettingsValue>(DEFAULT_MONITORING_SETTINGS);
  const [focusRaw, setFocus] = useState<string | null>(null);
  const [selRaw, setSel] = useState<Selection | null>(null);

  // ----- per config: plotted units over the whole history (so trailing baselines are right), then cut to the range -----
  const perConfig = useMemo(
    () =>
      configs.map((c) => {
        const indexed = c.runs.map((run, idx) => ({ run, idx }));
        const units: Unit[] =
          effectiveGranularity === "run"
            ? indexed.map(({ run, idx }) => ({ t: runTime(run), run, idxs: [idx], flagged: false }))
            : bucketByDay(c.runs).map((d) => ({
                t: d.t + DAY_MS / 2,
                run: d.pooled,
                idxs: indexed.filter(({ run }) => run.startedAt.slice(0, 10) === d.day).map(({ idx }) => idx),
                flagged: false,
              }));
        const window = effectiveGranularity === "run" ? 4 : 3;
        const flagged = units.map((u, i) => ({ ...u, flagged: isRegression(units.map((x) => x.run), i, window) }));
        const inRange = flagged.filter((u) => u.t >= range.from - (effectiveGranularity === "day" ? DAY_MS / 2 : 0) && u.t <= range.to + (effectiveGranularity === "day" ? DAY_MS / 2 : 0));
        const runsInRange = indexed.filter(({ run }) => runTime(run) >= range.from && runTime(run) <= range.to);
        return { config: c, units: inRange, runsInRange };
      }),
    [configs, effectiveGranularity, range.from, range.to],
  );

  // `pick` returns null where the data was not recorded, so the chart leaves a gap rather than drawing a false zero.
  const buildSeries = (pick: (r: MonitoringRun) => { value: number; low?: number; high?: number } | null, flags = false): TrendSeries[] =>
    perConfig.map(({ config, units }) => ({
      id: config.id,
      label: config.label,
      color: colors[config.id],
      points: units.flatMap((u) => {
        const v = pick(u.run);
        return v ? [{ t: u.t, ...v, flagged: flags && u.flagged }] : [];
      }),
    }));

  const passSeries = buildSeries((r) => {
    const p = runPassRate(r);
    return { value: p.rate, low: p.low, high: p.high };
  }, true);
  const latencySeries = buildSeries((r) => (r.timedN > 0 ? { value: r.latency.p95 } : null));
  const costSeries = buildSeries((r) => {
    const c = costPerConversation(r);
    return c == null ? null : { value: c };
  });

  // ----- selection (a single run, or all runs of a day) -----
  const defaultConfig = perConfig[0];
  const resolveSelection = (): { configId: string; idxs: number[] } => {
    const target = selRaw && perConfig.find((p) => p.config.id === selRaw.configId);
    if (target) {
      const visible = selRaw!.idxs.filter((i) => target.runsInRange.some((r) => r.idx === i));
      if (visible.length) return { configId: selRaw!.configId, idxs: visible };
    }
    const last = defaultConfig.units.at(-1);
    return { configId: defaultConfig.config.id, idxs: last?.idxs ?? [defaultConfig.config.runs.length - 1] };
  };
  const selection = resolveSelection();
  const selConfig = configs.find((c) => c.id === selection.configId)!;
  const selRuns = selection.idxs.map((i) => selConfig.runs[i]);
  const selPooled = poolRuns(selRuns);
  const selLabel =
    selRuns.length === 1 ? `Run of ${fmtDayTime(selRuns[0].startedAt)} UTC` : `${fmtDay(new Date(selRuns[0].startedAt.slice(0, 10)).getTime())} — ${selRuns.length} runs pooled`;

  const pr = runPassRate(selPooled);
  const state = healthState(pr, settings.threshold);
  const baseline = trailingBaseline(selConfig.runs, Math.min(...selection.idxs), selRuns.length > 1 ? 8 : 4);

  // ----- check deep dive -----
  const selectedConfigData = perConfig.find((p) => p.config.id === selConfig.id)!;
  const heatDays = useMemo(() => bucketByDay(selectedConfigData.runsInRange.map((r) => r.run)), [selectedConfigData]);
  const worstCheck = useMemo(() => {
    const pooled = poolRuns(selectedConfigData.runsInRange.map((r) => r.run));
    return [...assertions].sort((a, b) => assertionPassRate(pooled, a.name).rate - assertionPassRate(pooled, b.name).rate)[0].name;
  }, [assertions, selectedConfigData]);
  const focus = focusRaw ?? worstCheck;
  const focusMeta = assertions.find((a) => a.name === focus);
  const focusSeries = buildSeries((r) => {
    const p = assertionPassRate(r, focus);
    return { value: p.rate, low: p.low, high: p.high };
  });
  const focusPeriod = assertionPassRate(poolRuns(selectedConfigData.runsInRange.map((r) => r.run)), focus);

  const coFailing = useMemo(() => {
    const counts = new Map<string, number>();
    let base = 0;
    for (const p of poolRuns(selectedConfigData.runsInRange.map((r) => r.run)).patterns) {
      if (!p.signature.includes(focus)) continue;
      base += p.count;
      for (const f of p.signature) if (f !== focus) counts.set(f, (counts.get(f) ?? 0) + p.count);
    }
    return { base, rows: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5) };
  }, [selectedConfigData, focus]);

  // ----- patterns -----
  const trends = useMemo(() => patternTrends(heatDays.map((d) => d.runs)), [heatDays]);
  const selPatterns = failurePatterns(selPooled);

  // ----- runs table -----
  const rows: RunRow[] = perConfig.flatMap(({ config, runsInRange }) =>
    runsInRange.map(({ run, idx }) => ({
      configId: config.id,
      configLabel: multi ? config.label : variantLabel(run),
      configColor: colors[config.id],
      index: idx,
      run,
      regression: isRegression(config.runs, idx, 4),
    })),
  );

  // ----- period summary per config -----
  const summaries = perConfig.map(({ config, runsInRange, units }) => {
    const pooled = poolRuns(runsInRange.map((r) => r.run));
    return {
      config,
      pr: runPassRate(pooled),
      runs: runsInRange.length,
      regressions: units.filter((u) => u.flagged).length,
      belowThreshold: runsInRange.filter(({ run }) => runPassRate(run).rate < settings.threshold).length,
    };
  });

  const selectConfig = (configId: string) => {
    const p = perConfig.find((x) => x.config.id === configId)!;
    const last = p.units.at(-1);
    if (last) setSel({ configId, idxs: last.idxs });
  };

  return (
    <PageShell className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Activity size={18} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">Observability</h1>
              <Badge tone="info">Preview</Badge>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              How a prompt behaves on real production conversations, checked on a schedule. Pass rate over time, which checks are failing, and what
              monitoring would cost.
            </p>
          </div>
        </div>
        <div className="flex max-w-sm items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <ShieldCheck size={14} className="mt-px shrink-0" />
          <span>
            Real online-eval results ({monitoringFixture.generatedFrom}). Chat IDs are one-way hashed and no conversation text is included.
          </span>
        </div>
      </div>

      {/* Period controls */}
      <div className="sticky top-0 z-10 -mx-2 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-slate-100 bg-white/95 px-3 py-2 backdrop-blur">
        <span className="text-xs font-medium text-slate-500">{monitoringFixture.name}</span>
        <div className="inline-flex rounded-lg border border-border bg-background p-0.5" role="group" aria-label="Period">
          {RANGE_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setPresetId(p.id);
                setCustom(null);
              }}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs transition-colors",
                !custom && presetId === p.id ? "bg-accent font-medium text-accent-foreground" : "text-slate-500 hover:text-slate-800",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <input
            type="date"
            aria-label="From"
            value={toDateInput(range.from)}
            min={toDateInput(dataStart)}
            max={toDateInput(dataEnd)}
            onChange={(e) => e.target.value && setCustom({ from: new Date(`${e.target.value}T00:00:00Z`).getTime(), to: range.to })}
            className="h-7 rounded-md border border-border bg-background px-1.5 text-xs"
          />
          –
          <input
            type="date"
            aria-label="To"
            value={toDateInput(range.to)}
            min={toDateInput(dataStart)}
            max={toDateInput(dataEnd)}
            onChange={(e) => e.target.value && setCustom({ from: range.from, to: new Date(`${e.target.value}T23:59:59Z`).getTime() })}
            className="h-7 rounded-md border border-border bg-background px-1.5 text-xs"
          />
          {custom && (
            <button
              onClick={() => setCustom(null)}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <ZoomOut size={12} /> Reset
            </button>
          )}
        </div>
        {variants.length > 1 && (
        <div className="inline-flex rounded-lg border border-border bg-background p-0.5" role="group" aria-label="Judge versions">
          {([["pooled", "Pooled"], ["versions", "By judge version"]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                setMode(id);
                setSel(null);
              }}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs transition-colors",
                mode === id ? "bg-accent font-medium text-accent-foreground" : "text-slate-500 hover:text-slate-800",
              )}
              title={
                id === "pooled"
                  ? "One series: the evals of each scheduled run are combined"
                  : "Separate the differently-worded judge rubrics — pooling blends their pass rates"
              }
            >
              {label}
            </button>
          ))}
        </div>
        )}
        <div className="inline-flex rounded-lg border border-border bg-background p-0.5" role="group" aria-label="Granularity">
          {(["day", "run"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              disabled={g === "day" && rangeDays < 2.5}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs transition-colors disabled:opacity-40",
                effectiveGranularity === g ? "bg-accent font-medium text-accent-foreground" : "text-slate-500 hover:text-slate-800",
              )}
              title={g === "day" ? "Pool each day's runs into one point — a tighter range" : "One point per run"}
            >
              {g === "day" ? "Daily" : "Per run"}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-slate-400">
          {fmtDay(range.from)} – {fmtDay(range.to)} UTC · {rows.length} runs
        </span>
      </div>

      {/* Period summary + pass-rate chart */}
      <Card>
        <CardHeader>
          <CardTitle>
            Pass rate over time<Req ids="VOL-3 · VOL-4 · ALR-2" />
          </CardTitle>
          <CardDescription>
            The shaded band is the 95% range — the true rate could sit anywhere inside it. A red point means the whole band is below the recent
            average: a real drop, not noise. {effectiveGranularity === "day" ? "Each point pools a day of runs (about 400 conversations), so the band is tighter than per run." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            {summaries.map((s) => (
              <div key={s.config.id} className="flex items-center gap-4 rounded-lg border border-slate-100 px-3 py-2">
                <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: colors[s.config.id] }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{s.config.label}</p>
                  <p className="text-xs text-slate-500">
                    {s.pr.total.toLocaleString()} conversations · {s.runs} runs
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-semibold tabular-nums text-slate-900">{formatPercent(s.pr.rate, 1)}</p>
                  <p className="text-[11px] tabular-nums text-slate-400">
                    {formatPercent(s.pr.low, 1)}–{formatPercent(s.pr.high, 1)}
                  </p>
                </div>
                <div className="w-28 text-right text-[11px] text-slate-500">
                  <p>{s.belowThreshold} runs below {formatPercent(settings.threshold)}</p>
                  <p className={s.regressions ? "font-medium text-red-600" : ""}>
                    {s.regressions} regression {effectiveGranularity === "day" ? "days" : "runs"}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <TrendChart
            series={passSeries}
            format={(v) => formatPercent(v)}
            yMax={1}
            threshold={settings.threshold}
            thresholdLabel={`Alert below ${formatPercent(settings.threshold)}`}
            height={240}
            selected={{ seriesId: selection.configId, index: Math.max(0, selectedConfigData.units.findIndex((u) => u.idxs.some((i) => selection.idxs.includes(i)))) }}
            onSelect={(seriesId, index) => {
              const u = perConfig.find((p) => p.config.id === seriesId)?.units[index];
              if (u) setSel({ configId: seriesId, idxs: u.idxs });
            }}
            onBrush={(from, to) => setCustom({ from, to })}
            ariaLabel="Pass rate over time with 95% confidence band"
          />
        </CardContent>
      </Card>

      {/* Selected run / day */}
      <div>
        <p className="mb-2 flex items-center gap-2 text-xs text-slate-500">
          <span className="inline-block size-2 rounded-full" style={{ background: colors[selection.configId] }} />
          {multi && <span className="font-medium text-slate-700">{selConfig.label} · </span>}
          {selLabel}
          <span className="text-slate-400">— click a point or a row below to look at another</span>
        </p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Tile
            title="Pass rate"
            footer={
              <>
                95% range {formatPercent(pr.low)}–{formatPercent(pr.high)} from {pr.total} conversations
                {baseline != null && <> · baseline {formatPercent(baseline)}</>}
              </>
            }
          >
            <div className="flex items-center gap-2">
              <p className="text-3xl font-semibold tabular-nums text-slate-900">{formatPercent(pr.rate)}</p>
              <Badge tone={HEALTH_BADGE[state].tone} title={HEALTH_BADGE[state].hint}>
                {HEALTH_BADGE[state].label}
              </Badge>
            </div>
          </Tile>
          <Tile
            title="Conversations graded"
            footer={
              selPooled.repeatedChats > 0
                ? "The same chat can be sampled more than once. Repeats are kept in the totals, so those chats count extra."
                : "Every graded conversation is a different chat"
            }
          >
            <p className="text-3xl font-semibold tabular-nums text-slate-900">{selPooled.n}</p>
            <p className="text-xs text-slate-500">{selPooled.uniqueChats} distinct chats</p>
            {selPooled.n - selPooled.uniqueChats > 0 && (
              <Badge
                tone="warning"
                className="mt-1.5"
                title={`${selPooled.repeatedChats} chat${selPooled.repeatedChats === 1 ? " was" : "s were"} sampled more than once`}
              >
                {selPooled.n - selPooled.uniqueChats} repeats · {Math.round(((selPooled.n - selPooled.uniqueChats) / selPooled.n) * 100)}% of sample
              </Badge>
            )}
          </Tile>
          <Tile
            title="Response time"
            footer={selPooled.timedN === 0 ? "Not recorded for these runs" : selRuns.length > 1 ? "Averaged across the day's runs" : "Time the production reply took"}
          >
            {selPooled.timedN === 0 ? (
              <p className="text-3xl font-semibold text-slate-300">—</p>
            ) : (
              <>
                <p className="text-3xl font-semibold tabular-nums text-slate-900">
                  {(selPooled.latency.p50 / 1000).toFixed(1)}s<span className="ml-1 text-sm font-normal text-slate-400">typical</span>
                </p>
                <p className="text-xs text-slate-500">{(selPooled.latency.p95 / 1000).toFixed(1)}s for the slowest 1 in 20</p>
              </>
            )}
          </Tile>
          <Tile title="Production cost" footer={selPooled.costedN === 0 ? "Not recorded for these runs" : "What these conversations cost to serve"}>
            {selPooled.costedN === 0 ? (
              <p className="text-3xl font-semibold text-slate-300">—</p>
            ) : (
              <>
                <p className="text-3xl font-semibold tabular-nums text-slate-900">{formatUsd(selPooled.productionCost)}</p>
                <p className="text-xs text-slate-500">{formatUsd(costPerConversation(selPooled)!)} per conversation</p>
              </>
            )}
          </Tile>
        </div>
      </div>

      {/* Latency + cost */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              Slowest replies<Req ids="INS-3" />
            </CardTitle>
            <CardDescription>
              The 95th-percentile response time{effectiveGranularity === "day" ? " (averaged over each day's runs)" : ""}. Runs that did not record it are left out, not drawn as zero.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart series={latencySeries} format={(v) => `${(v / 1000).toFixed(1)}s`} yMin={0} height={170} ariaLabel="95th percentile latency over time" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              Cost per conversation<Req ids="INS-3" />
            </CardTitle>
            <CardDescription>Average production cost of one conversation. Runs that did not record it are left out.</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart series={costSeries} format={(v) => `$${v.toFixed(4)}`} yMin={0} height={170} ariaLabel="Cost per conversation over time" />
          </CardContent>
        </Card>
      </div>

      {/* Checks: heatmap + zoom in */}
      <Card>
        <CardHeader>
          <CardTitle>
            Which checks are failing<Req ids="INS-4 · FOC-1" />
          </CardTitle>
          <CardDescription>Worst check over the period first, by day. Click a check to zoom in on it.</CardDescription>
          <div className={cn("mt-1 w-fit rounded-lg border border-border bg-background p-0.5", multi ? "inline-flex" : "hidden")} role="tablist" aria-label="Judge version">
            {configs.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={c.id === selection.configId}
                onClick={() => selectConfig(c.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
                  c.id === selection.configId ? "bg-accent font-medium text-accent-foreground" : "text-slate-500 hover:text-slate-800",
                )}
              >
                <span className="inline-block size-2 rounded-full" style={{ background: colors[c.id] }} />
                {c.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <AssertionHeatmap assertions={assertions} days={heatDays} selected={focus} onSelect={setFocus} />

          <div className="grid gap-6 rounded-lg border border-slate-100 p-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div>
            <div className="flex items-center gap-2">
              <p className="font-mono text-sm font-medium text-slate-900">{focus}</p>
              <Badge tone="neutral">{focusMeta?.kind === "judge" ? "AI judge" : "Rule"}</Badge>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {formatPercent(focusPeriod.rate, 1)} pass over the period · {focusPeriod.total - focusPeriod.passed} of {focusPeriod.total.toLocaleString()} failed
              {multi && ` (${selConfig.label})`}
            </p>
            <div className="mt-3">
              <TrendChart series={focusSeries} format={(v) => formatPercent(v)} yMax={1} height={170} showBand={false} ariaLabel={`Pass rate of ${focus} over time`} />
            </div>
            </div>
            <div className="lg:border-l lg:border-slate-100 lg:pl-6">
              <p className="text-xs font-medium text-slate-600">Fails together with</p>
              {coFailing.rows.length === 0 ? (
                <p className="mt-1 text-xs text-slate-400">{coFailing.base === 0 ? "This check did not fail in the period." : "Always fails on its own."}</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {coFailing.rows.map(([name, n]) => (
                    <li key={name} className="flex items-center justify-between gap-2 text-xs">
                      <button onClick={() => setFocus(name)} className="truncate font-mono text-[11px] text-slate-700 hover:underline">
                        {name}
                      </button>
                      <span className="shrink-0 tabular-nums text-slate-400">
                        {n} of {coFailing.base}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-slate-400">Checks that fail on the same conversations usually share one cause — fix one, and the others may clear.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Patterns across the period */}
      <Card>
        <CardHeader>
          <CardTitle>
            Failure patterns over the period<Req ids="INS-5" />
          </CardTitle>
          <CardDescription>
            Failing conversations grouped by which checks failed together{multi && ` (${selConfig.label})`}. A pattern first seen late in the period is flagged
            new.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PatternTrends
            trends={trends}
            periodStart={new Date(range.from).toISOString()}
            periodEnd={new Date(range.to).toISOString()}
          />
        </CardContent>
      </Card>

      {/* Runs table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Runs in this period<Req ids="INS-1 · INS-2" />
          </CardTitle>
          <CardDescription>One row per run in the selected period. Passing conversations are never listed — click a run to inspect it above and below.</CardDescription>
        </CardHeader>
        <CardContent>
          <RunsTable
            rows={rows}
            threshold={settings.threshold}
            selected={selection.idxs.length === 1 ? { configId: selection.configId, index: selection.idxs[0] } : null}
            onSelect={(configId, index) => setSel({ configId, idxs: [index] })}
          />
        </CardContent>
      </Card>

      {/* Selected run's failures */}
      <Card>
        <CardHeader>
          <CardTitle>
            Failures in the selected {selRuns.length === 1 ? "run" : "day"}<Req ids="INS-5 · IDN-1" />
          </CardTitle>
          <CardDescription>
            {multi && `${selConfig.label} · `}{selLabel}. Chats are identified by a hashed chat ID; in production this is where you would open the conversation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FailurePatterns patterns={selPatterns} totalGraded={selPooled.n} />
        </CardContent>
      </Card>

      {/* Settings + cost */}
      <Card>
        <CardHeader>
          <CardTitle>
            Monitoring settings & cost<Req ids="CAD-1 · VOL-1 · ALR-1 · GOV-5" />
          </CardTitle>
          <CardDescription>
            What you would control per prompt. Today the schedule is fixed at every 6 hours with at most 250 conversations; here you can see what changing
            that would do to the cost and to the alert line.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MonitoringSettings value={settings} onChange={setSettings} sample={selRuns.length === 1 ? selRuns[0] : poolRuns([selRuns[0]])} />
        </CardContent>
      </Card>

      <p className="pb-4 text-xs leading-relaxed text-slate-400">
        Prototype. One prompt's schedule is shown: online evals every 6 hours from Sep 18 to Oct 2 (the schedule's 14-day run). Other evals carry the
        same name because other prompts' schedules reuse the config, so they were left out — they are told apart by schedule timing, since nothing in an
        eval result names its prompt. Daily points pool that day's runs; pooled response times are conversation-weighted averages, so treat them as
        approximate. Requirement IDs (e.g. VOL-3) refer to the production monitoring vision document.
      </p>
    </PageShell>
  );
}
