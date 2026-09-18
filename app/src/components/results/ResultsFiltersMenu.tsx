import { useRef, useState } from "react";
import { ListFilter } from "lucide-react";
import type { Assertion, AssertionTier, DatasetItemSource } from "../../types";
import { countActiveFilters, DEFAULT_RESULTS_FILTERS, NO_LABEL_FILTER_VALUE, type ResultsFilters } from "../../results";
import type { ResultsViewPrefs } from "../../resultsViewPrefs";
import { DATASET_SOURCE_LABEL } from "../../dataset";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatasetSourceIcon } from "../dataset/DatasetSourceIcon";

function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5" onClick={(e) => e.stopPropagation()}>
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
            value === opt.id ? "bg-primary text-primary-foreground" : "text-slate-600 hover:text-slate-800"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/**
 * "Filters" popover — everything beyond the toolbar's quick All/Passed/Failed pills: which single
 * metric to filter by (and its outcome), which labels a row must/mustn't have, dataset row source,
 * latency/cost/token ranges, and whether a row has a reference output. Inspired by promptfoo's
 * Filters button, generalized past just pass/fail.
 *
 * Every section here mirrors a column that's actually visible in `prefs` — filtering only exists
 * for what you can currently see in the table, never a dimension the table doesn't display (e.g.
 * hide the Cost column and its filter disappears too, instead of filtering on a number you can't
 * verify against).
 */
export function ResultsFiltersMenu({
  filters,
  onChange,
  assertions,
  allLabels,
  prefs,
}: {
  filters: ResultsFilters;
  onChange: (patch: Partial<ResultsFilters>) => void;
  assertions: Assertion[];
  allLabels: string[];
  prefs: ResultsViewPrefs;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeCount = countActiveFilters(filters, prefs.hiddenColumns);
  const showChecks = !prefs.hiddenColumns.includes("checks");
  const showLabels = !prefs.hiddenColumns.includes("labels");
  const showSource = !prefs.hiddenColumns.includes("source");
  const showLatency = !prefs.hiddenColumns.includes("latency");
  const showCost = !prefs.hiddenColumns.includes("cost");
  const showTokens = !prefs.hiddenColumns.includes("tokens");
  const showReferenceOutput = !prefs.hiddenColumns.includes("referenceOutput");

  function toggleLabel(label: string) {
    onChange({
      labels: filters.labels.includes(label) ? filters.labels.filter((l) => l !== label) : [...filters.labels, label],
    });
  }

  function toggleSource(source: DatasetItemSource) {
    onChange({
      sources: filters.sources.includes(source) ? filters.sources.filter((s) => s !== source) : [...filters.sources, source],
    });
  }

  return (
    <div className="relative" ref={ref}>
      <Button size="sm" onClick={() => setOpen((v) => !v)}>
        <ListFilter size={13} /> Filters
        {activeCount > 0 && <Badge tone="accent">{activeCount}</Badge>}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-80 space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-lg shadow-slate-900/10">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Filters</p>
              {activeCount > 0 && (
                <button
                  onClick={() => onChange(DEFAULT_RESULTS_FILTERS)}
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            {showChecks && assertions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-700">Metric</p>
                <div className="flex items-center gap-1.5">
                  <select
                    value={filters.assertionId ?? ""}
                    onChange={(e) => onChange({ assertionId: e.target.value || null })}
                    className="min-w-0 flex-1 truncate rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-700 outline-none focus:border-ring"
                  >
                    <option value="">Any metric</option>
                    {assertions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.description.slice(0, 60)}
                      </option>
                    ))}
                  </select>
                  {filters.assertionId && (
                    <SegmentedToggle
                      value={filters.assertionOutcome}
                      options={[
                        { id: "failed", label: "Failed" },
                        { id: "passed", label: "Passed" },
                      ]}
                      onChange={(assertionOutcome) => onChange({ assertionOutcome })}
                    />
                  )}
                </div>
              </div>
            )}

            {showChecks && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-700">Metric type</p>
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      { id: "deterministic", label: "Deterministic" },
                      { id: "custom_code", label: "Custom code" },
                      { id: "rubric_grading", label: "LLM rubric" },
                    ] as { id: AssertionTier; label: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => onChange({ assertionTier: filters.assertionTier === opt.id ? null : opt.id })}
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        filters.assertionTier === opt.id
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showLabels && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-700">Labels</p>
              {allLabels.length === 0 ? (
                <p className="text-[11px] italic text-slate-400">No labels have been added yet.</p>
              ) : (
                <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                  {[NO_LABEL_FILTER_VALUE, ...allLabels].map((label) => (
                    <button
                      key={label}
                      onClick={() => toggleLabel(label)}
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        filters.labels.includes(label)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {label === NO_LABEL_FILTER_VALUE ? "(no label)" : label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            )}

            {showSource && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-700">Dataset row source</p>
              <div className="flex flex-wrap gap-1">
                {(Object.keys(DATASET_SOURCE_LABEL) as DatasetItemSource[]).map((source) => (
                  <button
                    key={source}
                    onClick={() => toggleSource(source)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      filters.sources.includes(source)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <DatasetSourceIcon source={source} size={11} />
                    {DATASET_SOURCE_LABEL[source]}
                  </button>
                ))}
              </div>
            </div>
            )}

            {(showLatency || showCost || showTokens) && (
            <div className="grid grid-cols-2 gap-3">
              {showLatency && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-700">Latency (ms)</p>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    placeholder="Min"
                    value={filters.minLatencyMs ?? ""}
                    onChange={(e) => onChange({ minLatencyMs: e.target.value === "" ? null : Number(e.target.value) })}
                    className="w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-800 outline-none focus:border-ring"
                  />
                  <span className="text-slate-300">–</span>
                  <input
                    type="number"
                    min={0}
                    placeholder="Max"
                    value={filters.maxLatencyMs ?? ""}
                    onChange={(e) => onChange({ maxLatencyMs: e.target.value === "" ? null : Number(e.target.value) })}
                    className="w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-800 outline-none focus:border-ring"
                  />
                </div>
              </div>
              )}
              {showCost && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-700">Cost (USD)</p>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    placeholder="Min"
                    value={filters.minCostUsd ?? ""}
                    onChange={(e) => onChange({ minCostUsd: e.target.value === "" ? null : Number(e.target.value) })}
                    className="w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-800 outline-none focus:border-ring"
                  />
                  <span className="text-slate-300">–</span>
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    placeholder="Max"
                    value={filters.maxCostUsd ?? ""}
                    onChange={(e) => onChange({ maxCostUsd: e.target.value === "" ? null : Number(e.target.value) })}
                    className="w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-800 outline-none focus:border-ring"
                  />
                </div>
              </div>
              )}
              {showTokens && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-700">Tokens</p>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    placeholder="Min"
                    value={filters.minTokens ?? ""}
                    onChange={(e) => onChange({ minTokens: e.target.value === "" ? null : Number(e.target.value) })}
                    className="w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-800 outline-none focus:border-ring"
                  />
                  <span className="text-slate-300">–</span>
                  <input
                    type="number"
                    min={0}
                    placeholder="Max"
                    value={filters.maxTokens ?? ""}
                    onChange={(e) => onChange({ maxTokens: e.target.value === "" ? null : Number(e.target.value) })}
                    className="w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-800 outline-none focus:border-ring"
                  />
                </div>
              </div>
              )}
            </div>
            )}

            {showReferenceOutput && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-700">Reference output</p>
              <SegmentedToggle
                value={filters.hasReferenceOutput}
                options={[
                  { id: "any", label: "Any" },
                  { id: "yes", label: "Has one" },
                  { id: "no", label: "None" },
                ]}
                onChange={(hasReferenceOutput) => onChange({ hasReferenceOutput })}
              />
            </div>
            )}

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-700">Reviewer note</p>
              <SegmentedToggle
                value={filters.hasNote}
                options={[
                  { id: "any", label: "Any" },
                  { id: "yes", label: "Has note" },
                  { id: "no", label: "None" },
                ]}
                onChange={(hasNote) => onChange({ hasNote })}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
