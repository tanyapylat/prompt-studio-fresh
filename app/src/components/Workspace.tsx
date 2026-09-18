import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  Braces,
  ChevronLeft,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Rocket,
  Sparkles,
  Square,
} from "lucide-react";
import { useStore } from "../store";
import { useAssistantActions, useRequestedTab, useSetAssistantView } from "../assistantContext";
import { getArtifactStaleness, isSpecPublished, rerun } from "../specFactory";
import { publishSpec } from "../lifecycle";
import type { GenerateArtifact } from "../types";
import { computeCoverage } from "../coverage";
import { pickRandomIds } from "../dataset";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SpecPane } from "./panes/SpecPane";
import { SpecJsonModal } from "./panes/SpecJsonModal";
import { PromptPane } from "./panes/PromptPane";
import { EvalPane } from "./panes/EvalPane";
import { DatasetPane } from "./panes/DatasetPane";
import { ResultsPane } from "./panes/ResultsPane";
import { ReviewPane } from "./panes/ReviewPane";
import { ObservabilityPane } from "./panes/ObservabilityPane";

type Tab = "prompt" | "eval" | "dataset" | "results" | "review" | "observability";
type Busy = "sample" | "full" | "publish" | null;

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

const TABS: { id: Tab; label: string; planned?: boolean }[] = [
  { id: "prompt", label: "Prompt" },
  { id: "eval", label: "Eval" },
  { id: "dataset", label: "Dataset" },
  { id: "results", label: "Results" },
  { id: "review", label: "Review" },
  { id: "observability", label: "Observability", planned: true },
];

const ARTIFACTS: GenerateArtifact[] = ["prompt", "assertions", "dataset"];
const ARTIFACT_TAB: Record<GenerateArtifact, Tab> = { prompt: "prompt", assertions: "eval", dataset: "dataset" };
const ARTIFACT_LABEL: Record<GenerateArtifact, string> = { prompt: "Prompt", assertions: "Assertions", dataset: "Dataset" };

function readStoredTab(specId?: string): Tab {
  if (!specId) return "prompt";
  try {
    const stored = localStorage.getItem(`${WORKSPACE_TAB_STORAGE_PREFIX}${specId}`);
    return TABS.some((item) => item.id === stored) ? (stored as Tab) : "prompt";
  } catch {
    return "prompt";
  }
}

export function saveTab(specId: string, tab: Tab) {
  try {
    localStorage.setItem(`${WORKSPACE_TAB_STORAGE_PREFIX}${specId}`, tab);
  } catch {
    // Tab selection should still work when browser storage is unavailable.
  }
}

export function Workspace() {
  const { selected: spec, select, updateSpec, currentUserId } = useStore();
  const [tab, setTab] = useState<Tab>(() => readStoredTab(spec?.id));
  const [specCollapsed, setSpecCollapsed] = useState(false);
  const [specWidth, setSpecWidth] = useState(readStoredSpecWidth);
  const [specJsonOpen, setSpecJsonOpen] = useState(false);
  const [specFullScreen, setSpecFullScreen] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const { openWithPrompt } = useAssistantActions();
  const { requestedTab, consumeRequestedTab } = useRequestedTab();
  useSetAssistantView({
    specId: spec?.id ?? null,
    specName: spec?.name ?? null,
    tab: spec ? tab : null,
    status: spec ? (isSpecPublished(spec) ? "published" : "draft") : null,
  });
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);
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
    setTab(readStoredTab(spec?.id));
    setSelectedDatasetIds(new Set());
  }, [spec?.id]);

  // North Star's `navigate` tool lands here after it generates/runs something, so the user sees the result.
  useEffect(() => {
    if (!spec || !requestedTab) return;
    if (TABS.some((t) => t.id === requestedTab)) {
      setTab(requestedTab as Tab);
      saveTab(spec.id, requestedTab as Tab);
    }
    consumeRequestedTab();
  }, [spec, requestedTab, consumeRequestedTab]);

  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

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
  const published = isSpecPublished(spec);
  const staleArtifacts = ARTIFACTS.map((artifact) => ({ artifact, ...getArtifactStaleness(spec, artifact) })).filter(
    (s) => s.manuallyEdited || s.briefChangedSince,
  );

  function selectTab(nextTab: Tab) {
    setTab(nextTab);
    saveTab(specId, nextTab);
  }

  async function run<T>(
    kind: Busy,
    task: (signal: AbortSignal) => Promise<T>,
    onDone: (result: T) => void,
    nextTab?: Tab,
  ) {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setBusy(kind);
    setError(null);
    try {
      const result = await task(controller.signal);
      onDone(result);
      if (nextTab) selectTab(nextTab);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(null);
      abortControllerRef.current = null;
    }
  }

  function handleStop() {
    abortControllerRef.current?.abort();
  }

  function handleRunSample(itemIds: string[]) {
    if (itemIds.length === 0) return;
    run(
      "sample",
      (signal) => rerun(spec!, itemIds, signal, currentUserId),
      (updated) => updateSpec(specId, () => updated),
      "results",
    );
  }
  function handleRunRandomN(count: number) {
    handleRunSample(pickRandomIds(spec!.dataset.map((d) => d.id), count));
  }
  // Run and Publish are direct actions (not AI generation), so they execute immediately — no
  // North Star round-trip. Generate/Regenerate is the one thing here that's actually AI-authored,
  // so that one still opens North Star, narrated, per the rest of the app's convention.
  function handleRunFull() {
    run("full", (signal) => rerun(spec!, undefined, signal, currentUserId), (updated) => updateSpec(specId, () => updated), "results");
  }
  function handlePublish() {
    run("publish", (signal) => publishSpec(spec!, signal, currentUserId), (updated) => updateSpec(specId, () => updated), "results");
  }
  function toggleDatasetSelect(id: string) {
    setSelectedDatasetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
          <Badge tone={published ? "success" : "neutral"}>{published ? "Published" : "Draft"}</Badge>
          <span className="text-xs text-slate-400">
            {coverage.covered}/{coverage.total} covered
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() =>
              openWithPrompt(
                spec.target
                  ? "Regenerate the Prompt, Assertions, and Dataset for this Spec."
                  : "Generate the Prompt, Assertions, and Dataset for this Spec.",
              )
            }
            title="Opens North Star to generate — every AI-authored change is narrated there, not fired silently from a button."
          >
            <Sparkles size={14} /> {spec.target ? "Regenerate" : "Generate"}
          </Button>
          {spec.target && (
            <Button variant="secondary" disabled={busy !== null} onClick={handleRunFull} title="Runs the full eval suite directly.">
              <Play size={14} /> Run
            </Button>
          )}
          <Button
            variant="default"
            disabled={!hasCurrentRun || published || busy !== null}
            onClick={handlePublish}
            title={!hasCurrentRun ? "Run the current generated bundle before publishing" : "Publishes the current Target directly."}
          >
            <Rocket size={14} /> Publish
          </Button>
          {busy && (
            <Button variant="destructive" onClick={handleStop} title="Cancel the in-progress request">
              <Square size={13} /> Stop
            </Button>
          )}
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

      {staleArtifacts.length > 0 && (
        <div className="flex items-start gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <div className="flex-1 space-y-0.5">
            {staleArtifacts.map(({ artifact, manuallyEdited, briefChangedSince }) => (
              <p key={artifact}>
                <button
                  onClick={() => selectTab(ARTIFACT_TAB[artifact])}
                  className="font-medium underline hover:no-underline"
                >
                  {ARTIFACT_LABEL[artifact]}
                </button>{" "}
                {manuallyEdited && briefChangedSince
                  ? "was edited by hand and the Spec brief also changed since — they may no longer match. Regenerate to re-sync."
                  : manuallyEdited
                    ? "was edited by hand since it was generated — the Spec brief may not reflect this change. Regenerate to re-sync."
                    : "may be out of date — the Spec brief changed since it was generated. Regenerate to re-sync."}
              </p>
            ))}
          </div>
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
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => setSpecJsonOpen(true)}
                  title="View/edit as raw JSON"
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                >
                  <Braces size={15} />
                </button>
                <button
                  onClick={() => setSpecFullScreen(true)}
                  title="Expand to full screen"
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                >
                  <Maximize2 size={15} />
                </button>
                <button
                  onClick={() => setSpecCollapsed(true)}
                  title="Collapse Spec details to widen the workspace"
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                >
                  <PanelLeftClose size={15} />
                </button>
              </div>
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
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-ring/60 group-focus:bg-ring" />
            </div>
          </aside>
        )}

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="flex gap-1 border-b border-slate-200 bg-slate-50 px-4">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => selectTab(t.id)}
                title={t.planned ? "Not built yet — shows what's planned here" : undefined}
                className={clsx(
                  "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  tab === t.id
                    ? "border-primary text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-700",
                  t.planned && "text-slate-400",
                )}
              >
                {t.label}
                {t.planned && (
                  <span className="rounded-full border border-slate-300 bg-white px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                    Soon
                  </span>
                )}
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
                onClearSelection={() => setSelectedDatasetIds(new Set())}
                onRunSample={handleRunSample}
                onRunRandomN={handleRunRandomN}
                sampleRunBusy={busy === "sample"}
              />
            )}
            {tab === "results" && (
              <ResultsPane spec={spec} onRunSample={handleRunSample} sampleRunBusy={busy === "sample"} />
            )}
            {tab === "review" && <ReviewPane spec={spec} />}
            {tab === "observability" && <ObservabilityPane spec={spec} />}
          </div>
        </main>
      </div>

      {specJsonOpen && (
        <SpecJsonModal
          spec={spec}
          onApply={(next) => updateSpec(specId, () => next)}
          onClose={() => setSpecJsonOpen(false)}
        />
      )}

      {specFullScreen && (
        <Dialog open onOpenChange={(open) => !open && setSpecFullScreen(false)}>
          <DialogContent width="xl">
            <DialogHeader>
              <DialogTitle>Spec details — {spec.name}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <SpecPane spec={spec} />
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
