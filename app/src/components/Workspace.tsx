import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  ChevronLeft,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Rocket,
  Sparkles,
  Zap,
  ZapOff,
} from "lucide-react";
import { useStore } from "../store";
import { useSetAssistantView } from "../assistantContext";
import { generateFromSpec, rerun } from "../specFactory";
import { publishSpec } from "../lifecycle";
import { computeCoverage } from "../coverage";
import { checkApiHealth } from "../api";
import { pickRandomIds } from "../dataset";
import type { GenerateSelection } from "../types";
import { Badge, Button } from "./ui";
import { GenerateOptionsModal } from "./GenerateOptionsModal";
import { SpecPane } from "./panes/SpecPane";
import { PromptPane } from "./panes/PromptPane";
import { EvalPane } from "./panes/EvalPane";
import { DatasetPane } from "./panes/DatasetPane";
import { ResultsPane } from "./panes/ResultsPane";
import { ReviewPane } from "./panes/ReviewPane";

type Tab = "prompt" | "eval" | "dataset" | "results" | "review";
type Busy = "generate" | "run" | "sample" | "publish" | null;

const DEFAULT_SPEC_WIDTH = 380;
const MIN_SPEC_WIDTH = 280;
const MAX_SPEC_WIDTH = 720;
const MIN_WORKSPACE_WIDTH = 360;
const SPEC_WIDTH_STORAGE_KEY = "prompt-studio:spec-panel-width";
const WORKSPACE_TAB_STORAGE_PREFIX = "prompt-studio:workspace-tab:";

function readStoredSpecWidth() {
  try {
    const stored = Number.parseInt(localStorage.getItem(SPEC_WIDTH_STORAGE_KEY) ?? "", 10);
    return Number.isFinite(stored)
      ? Math.min(Math.max(stored, MIN_SPEC_WIDTH), MAX_SPEC_WIDTH)
      : DEFAULT_SPEC_WIDTH;
  } catch {
    return DEFAULT_SPEC_WIDTH;
  }
}

function saveSpecWidth(width: number) {
  try {
    localStorage.setItem(SPEC_WIDTH_STORAGE_KEY, String(Math.round(width)));
  } catch {
    // Resizing should still work when browser storage is unavailable.
  }
}

const TABS: { id: Tab; label: string }[] = [
  { id: "prompt", label: "Prompt" },
  { id: "eval", label: "Eval" },
  { id: "dataset", label: "Dataset" },
  { id: "results", label: "Results" },
  { id: "review", label: "Review" },
];

function readStoredTab(specId?: string): Tab {
  if (!specId) return "prompt";
  try {
    const stored = localStorage.getItem(`${WORKSPACE_TAB_STORAGE_PREFIX}${specId}`);
    return TABS.some((item) => item.id === stored) ? (stored as Tab) : "prompt";
  } catch {
    return "prompt";
  }
}

function saveTab(specId: string, tab: Tab) {
  try {
    localStorage.setItem(`${WORKSPACE_TAB_STORAGE_PREFIX}${specId}`, tab);
  } catch {
    // Tab selection should still work when browser storage is unavailable.
  }
}

export function Workspace() {
  const { selected: spec, select, updateSpec } = useStore();
  const [tab, setTab] = useState<Tab>(() => readStoredTab(spec?.id));
  const [specCollapsed, setSpecCollapsed] = useState(false);
  const [specWidth, setSpecWidth] = useState(readStoredSpecWidth);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [showGenerateOptions, setShowGenerateOptions] = useState(false);
  useSetAssistantView({
    specId: spec?.id ?? null,
    specName: spec?.name ?? null,
    tab: spec ? tab : null,
    status: spec?.status ?? null,
  });
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<Set<string>>(new Set());
  const workAreaRef = useRef<HTMLDivElement>(null);
  const specWidthRef = useRef(specWidth);
  const resizeStartRef = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const previousBodyStylesRef = useRef<{ cursor: string; userSelect: string } | null>(null);

  const clampSpecWidth = useCallback((width: number) => {
    const availableWidth = workAreaRef.current?.clientWidth ?? window.innerWidth;
    const responsiveMax = Math.max(
      MIN_SPEC_WIDTH,
      Math.min(MAX_SPEC_WIDTH, availableWidth - MIN_WORKSPACE_WIDTH),
    );
    return Math.min(Math.max(width, MIN_SPEC_WIDTH), responsiveMax);
  }, []);

  const applySpecWidth = useCallback((width: number) => {
    const clamped = clampSpecWidth(width);
    specWidthRef.current = clamped;
    setSpecWidth(clamped);
    return clamped;
  }, [clampSpecWidth]);

  function finishSpecResize(handle: HTMLDivElement, pointerId: number) {
    const start = resizeStartRef.current;
    if (!start || start.pointerId !== pointerId) return;
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    resizeStartRef.current = null;
    saveSpecWidth(specWidthRef.current);

    const previous = previousBodyStylesRef.current;
    if (previous) {
      document.body.style.cursor = previous.cursor;
      document.body.style.userSelect = previous.userSelect;
      previousBodyStylesRef.current = null;
    }
  }

  useEffect(() => {
    checkApiHealth().then((h) => setHasApiKey(h.hasApiKey));
  }, []);

  useEffect(() => {
    setTab(readStoredTab(spec?.id));
    setSelectedDatasetIds(new Set());
  }, [spec?.id]);

  useEffect(() => {
    function handleResize() {
      applySpecWidth(specWidthRef.current);
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      const previous = previousBodyStylesRef.current;
      if (previous) {
        document.body.style.cursor = previous.cursor;
        document.body.style.userSelect = previous.userSelect;
      }
    };
  }, [applySpecWidth]);

  if (!spec) return null;

  const specId = spec.id;
  const lastRun = spec.runs[spec.runs.length - 1] ?? null;
  const coverage = computeCoverage(spec);
  const hasCurrentRun = !!lastRun && lastRun.createdAt >= spec.updatedAt;
  const canPublish = hasCurrentRun && spec.status !== "published" && !busy;

  function selectTab(nextTab: Tab) {
    setTab(nextTab);
    saveTab(specId, nextTab);
  }

  async function run<T>(kind: Busy, task: () => Promise<T>, onDone: (result: T) => void, nextTab?: Tab) {
    setBusy(kind);
    setError(null);
    try {
      const result = await task();
      onDone(result);
      if (nextTab) selectTab(nextTab);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function handleGenerate(selection: GenerateSelection) {
    setShowGenerateOptions(false);
    run(
      "generate",
      () => generateFromSpec(spec!, selection),
      (updated) => updateSpec(specId, () => updated),
    );
  }
  function handleRerun() {
    run(
      "run",
      () => rerun(spec!),
      (updated) => updateSpec(specId, () => updated),
      "results",
    );
  }
  function handleRunSample(itemIds: string[]) {
    if (itemIds.length === 0) return;
    run(
      "sample",
      () => rerun(spec!, itemIds),
      (updated) => updateSpec(specId, () => updated),
      "results",
    );
  }
  function toggleDatasetSelect(id: string) {
    setSelectedDatasetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectRandomDatasetRows(count: number) {
    setSelectedDatasetIds(new Set(pickRandomIds(spec!.dataset.map((d) => d.id), count)));
  }
  function handlePublish() {
    run(
      "publish",
      () => publishSpec(spec!),
      (updated) => updateSpec(specId, () => updated),
      "review",
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => select(null)}>
            <ChevronLeft size={16} /> Specs
          </Button>
          <div className="h-5 w-px bg-slate-200" />
          <input
            value={spec.name}
            onChange={(e) =>
              updateSpec(spec.id, (s) => ({ ...s, name: e.target.value, updatedAt: Date.now() }))
            }
            className="bg-transparent text-sm font-semibold text-slate-900 outline-none"
          />
          <Badge tone={spec.status === "published" ? "success" : "neutral"}>
            {spec.status === "published" ? "Published" : "Draft"}
          </Badge>
          {lastRun?.citable && <Badge tone="accent">Citable run</Badge>}
          {hasApiKey === false && (
            <span
              title="No OPENAI_API_KEY configured — Generate/Run use an offline simulation. Add app/.env to enable live calls."
              className="inline-flex items-center gap-1 text-xs text-amber-600/80"
            >
              <ZapOff size={12} /> Simulated mode
            </span>
          )}
          {hasApiKey === true && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600/80">
              <Zap size={12} /> Live LLM
            </span>
          )}
          <span className="text-xs text-slate-400">
            {coverage.covered}/{coverage.total} covered
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowGenerateOptions(true)} disabled={!!busy}>
            {busy === "generate" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {busy === "generate" ? "Generating…" : spec.target ? "Regenerate" : "Generate"}
          </Button>
          {spec.target && (
            <Button variant="secondary" onClick={handleRerun} disabled={!!busy}>
              {busy === "run" ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {busy === "run" ? "Running…" : "Run"}
            </Button>
          )}
          <Button
            variant="primary"
            disabled={!canPublish}
            onClick={handlePublish}
            title={!hasCurrentRun ? "Run the current generated bundle before publishing" : undefined}
          >
            {busy === "publish" ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
            {busy === "publish" ? "Publishing…" : "Publish"}
          </Button>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-2 border-b border-rose-300 bg-rose-50 px-4 py-2 text-xs text-rose-700">
          <AlertTriangle size={13} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-rose-600/70 hover:text-rose-700">
            Dismiss
          </button>
        </div>
      )}

      <div ref={workAreaRef} className="flex flex-1 overflow-hidden">
        {specCollapsed ? (
          <button
            onClick={() => setSpecCollapsed(false)}
            title="Show Spec details"
            className="flex w-9 shrink-0 flex-col items-center gap-2 border-r border-slate-200 bg-slate-50 py-3 text-slate-400 hover:text-slate-700"
          >
            <PanelLeftOpen size={16} />
            <span className="text-[10px] font-medium uppercase tracking-wide [writing-mode:vertical-rl]">Spec</span>
          </button>
        ) : (
          <aside
            className="relative flex shrink-0 flex-col overflow-hidden border-r border-slate-200"
            style={{ width: specWidth }}
          >
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Spec details</span>
              <button
                onClick={() => setSpecCollapsed(true)}
                title="Collapse Spec details to widen the workspace"
                className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              >
                <PanelLeftClose size={15} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <SpecPane spec={spec} />
            </div>
            <div
              role="separator"
              aria-label="Resize Spec details panel"
              aria-orientation="vertical"
              aria-valuemin={MIN_SPEC_WIDTH}
              aria-valuemax={MAX_SPEC_WIDTH}
              aria-valuenow={Math.round(specWidth)}
              tabIndex={0}
              title="Drag to resize. Double-click to reset."
              onDoubleClick={() => {
                const width = applySpecWidth(DEFAULT_SPEC_WIDTH);
                saveSpecWidth(width);
              }}
              onKeyDown={(event) => {
                let nextWidth: number | null = null;
                if (event.key === "ArrowLeft") nextWidth = specWidthRef.current - 16;
                if (event.key === "ArrowRight") nextWidth = specWidthRef.current + 16;
                if (event.key === "Home") nextWidth = MIN_SPEC_WIDTH;
                if (event.key === "End") nextWidth = MAX_SPEC_WIDTH;
                if (nextWidth === null) return;

                event.preventDefault();
                const width = applySpecWidth(nextWidth);
                saveSpecWidth(width);
              }}
              onPointerDown={(event) => {
                if (event.button !== 0 || resizeStartRef.current) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                resizeStartRef.current = {
                  pointerId: event.pointerId,
                  x: event.clientX,
                  width: specWidthRef.current,
                };
                previousBodyStylesRef.current = {
                  cursor: document.body.style.cursor,
                  userSelect: document.body.style.userSelect,
                };
                document.body.style.cursor = "col-resize";
                document.body.style.userSelect = "none";
              }}
              onPointerMove={(event) => {
                const start = resizeStartRef.current;
                if (!start || start.pointerId !== event.pointerId) return;
                applySpecWidth(start.width + event.clientX - start.x);
              }}
              onPointerUp={(event) => finishSpecResize(event.currentTarget, event.pointerId)}
              onPointerCancel={(event) => finishSpecResize(event.currentTarget, event.pointerId)}
              className="group absolute inset-y-0 right-0 z-10 w-2 touch-none cursor-col-resize outline-none"
            >
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-sky-400 group-focus:bg-sky-500" />
            </div>
          </aside>
        )}

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="flex gap-1 border-b border-slate-200 bg-slate-50 px-4">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => selectTab(t.id)}
                className={clsx(
                  "border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  tab === t.id
                    ? "border-sky-500 text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-700",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="p-5">
            {tab === "prompt" && <PromptPane spec={spec} />}
            {tab === "eval" && <EvalPane spec={spec} />}
            {tab === "dataset" && (
              <DatasetPane
                spec={spec}
                selectedIds={selectedDatasetIds}
                onToggleSelect={toggleDatasetSelect}
                onSelectRandom={selectRandomDatasetRows}
                onClearSelection={() => setSelectedDatasetIds(new Set())}
                onRunSample={handleRunSample}
                sampleRunBusy={busy === "sample"}
              />
            )}
            {tab === "results" && <ResultsPane spec={spec} />}
            {tab === "review" && <ReviewPane spec={spec} />}
          </div>
        </main>
      </div>
      {showGenerateOptions && (
        <GenerateOptionsModal
          isRegenerate={!!spec.target}
          onGenerate={handleGenerate}
          onClose={() => setShowGenerateOptions(false)}
        />
      )}
    </div>
  );
}
