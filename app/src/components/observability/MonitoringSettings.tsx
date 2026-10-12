import type { MonitoringRun, MonitoringSettingsValue } from "@/monitoring";
import {
  FREQUENCY_OPTIONS,
  GRADING_PRICE_PER_1M,
  estimateMonthlyCostUsd,
  estimateRunCostUsd,
  formatPercent,
  formatUsd,
} from "@/monitoring";

interface MonitoringSettingsProps {
  value: MonitoringSettingsValue;
  onChange: (next: MonitoringSettingsValue) => void;
  /** A measured run, used to scale the cost estimate. */
  sample: MonitoringRun;
}

/** Illustrative monitoring controls: change them and watch the cost estimate and the alert line react. Nothing is saved. */
export function MonitoringSettings({ value, onChange, sample }: MonitoringSettingsProps) {
  const frequency = FREQUENCY_OPTIONS.find((f) => f.id === value.frequencyId) ?? FREQUENCY_OPTIONS[2];
  const perRun = estimateRunCostUsd(sample, value.traces);
  const monthly = estimateMonthlyCostUsd(sample, value.traces, frequency.hours);
  const conversationsPerMonth = Math.round(((30 * 24) / frequency.hours) * value.traces);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-5">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">How often to check</span>
          <select
            value={value.frequencyId}
            onChange={(e) => onChange({ ...value, frequencyId: e.target.value })}
            className="mt-1 h-8 w-full rounded-lg border border-border bg-background px-2 text-sm"
          >
            {FREQUENCY_OPTIONS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="flex justify-between text-xs font-medium text-slate-600">
            <span>Conversations per check</span>
            <span className="tabular-nums text-slate-900">{value.traces}</span>
          </span>
          <input
            type="range"
            min={25}
            max={1000}
            step={25}
            value={value.traces}
            onChange={(e) => onChange({ ...value, traces: Number(e.target.value) })}
            className="mt-2 w-full accent-indigo-500"
          />
          <span className="text-[11px] text-slate-400">More conversations means a tighter confidence range, and more cost.</span>
        </label>

        <label className="block">
          <span className="flex justify-between text-xs font-medium text-slate-600">
            <span>Alert when pass rate falls below</span>
            <span className="tabular-nums text-slate-900">{formatPercent(value.threshold)}</span>
          </span>
          <input
            type="range"
            min={0.5}
            max={1}
            step={0.01}
            value={value.threshold}
            onChange={(e) => onChange({ ...value, threshold: Number(e.target.value) })}
            className="mt-2 w-full accent-indigo-500"
          />
          <span className="text-[11px] text-slate-400">Moves the dashed line on the chart above.</span>
        </label>
      </div>

      <div className="rounded-lg bg-slate-50 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Estimated cost of monitoring</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">
          {formatUsd(monthly)}
          <span className="ml-1 text-sm font-normal text-slate-500">/ month</span>
        </p>
        <dl className="mt-3 space-y-1 text-xs text-slate-500">
          <div className="flex justify-between">
            <dt>Per check</dt>
            <dd className="tabular-nums">{formatUsd(perRun)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Conversations graded per month</dt>
            <dd className="tabular-nums">{conversationsPerMonth.toLocaleString()}</dd>
          </div>
        </dl>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          Estimate only. Scaled from the grading tokens this eval actually used, priced at an assumed ${GRADING_PRICE_PER_1M.input} / $
          {GRADING_PRICE_PER_1M.output} per million input / output tokens. Covers the AI-judge checks; rule checks are free. Nothing here is saved.
        </p>
      </div>
    </div>
  );
}
