import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type AssistantPanelTab = "chat" | "feedback";

/** Width (in px) of the slim icon-only rail North Star collapses to — also how much the main
 *  content area's right edge is inset by, so the rail never overlaps page content underneath it. */
export const ASSISTANT_RAIL_WIDTH = 56;

const DEFAULT_PANEL_WIDTH = 440;
const MIN_PANEL_WIDTH = 380;
const MAX_PANEL_WIDTH_RATIO = 0.7;
const PANEL_WIDTH_STORAGE_KEY = "ai-studio:north-star-panel-width";

/** Keeps the panel within [some preferred minimum, some preferred maximum] whenever the viewport
 *  has room for it, but never wider than the viewport itself — otherwise, on a narrow window, a
 *  fixed-width right-docked panel would push its own left edge (and everything in it) off-screen
 *  instead of shrinking to fit. */
function clampPanelWidth(width: number): number {
  const viewport = window.innerWidth;
  const floor = Math.min(MIN_PANEL_WIDTH, viewport);
  const preferredMax = Math.floor(viewport * MAX_PANEL_WIDTH_RATIO);
  const ceiling = Math.min(Math.max(preferredMax, floor), viewport);
  return Math.min(Math.max(width, floor), ceiling);
}

function readStoredPanelWidth(): number {
  try {
    const stored = Number.parseInt(localStorage.getItem(PANEL_WIDTH_STORAGE_KEY) ?? "", 10);
    return Number.isFinite(stored) ? clampPanelWidth(stored) : DEFAULT_PANEL_WIDTH;
  } catch {
    return DEFAULT_PANEL_WIDTH;
  }
}

function savePanelWidth(width: number) {
  try {
    localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(Math.round(width)));
  } catch {
    // Panel width is a nice-to-have — losing it silently beats breaking the app when storage is unavailable.
  }
}

/** "Where the user is" — kept separate from `store.tsx` since it's UI-only and never persisted. */
export interface AssistantView {
  section: string | null;
  specId: string | null;
  specName: string | null;
  tab: string | null;
  status: string | null;
}

const EMPTY_VIEW: AssistantView = { section: null, specId: null, specName: null, tab: null, status: null };

interface AssistantContextValue {
  view: AssistantView;
  mergeView: (partial: Partial<AssistantView>) => void;
  isOpen: boolean;
  panelTab: AssistantPanelTab;
  /** True when the open panel is shrunk to a slim icon-only rail — distinct from `isOpen`, which
   *  fully hides it behind the floating launcher bubble. Collapsing keeps North Star visibly
   *  "present" (and one click from reopening) instead of disappearing entirely. */
  collapsed: boolean;
  /** Current width (px) of the fully-expanded panel — user-resizable, persisted across sessions. */
  panelWidth: number;
  setPanelWidth: (width: number) => void;
  /** A question queued by `openWithPrompt` (e.g. from the Eval pane's rubric helper) for the chat panel to send. */
  pendingPrompt: string | null;
  /** A Workspace tab requested by North Star's `navigate` tool — `Workspace.tsx` applies and clears this. */
  requestedTab: string | null;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setPanelTab: (tab: AssistantPanelTab) => void;
  setCollapsed: (collapsed: boolean) => void;
  openWithPrompt: (text: string) => void;
  consumePendingPrompt: () => void;
  requestNavigate: (tab: string) => void;
  consumeRequestedTab: () => void;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function AssistantContextProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<AssistantView>(EMPTY_VIEW);
  const [isOpen, setIsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [panelTab, setPanelTab] = useState<AssistantPanelTab>("chat");
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [requestedTab, setRequestedTab] = useState<string | null>(null);
  const [panelWidth, setPanelWidthRaw] = useState<number>(() => readStoredPanelWidth());

  const setPanelWidth = useCallback((next: number) => {
    const clamped = clampPanelWidth(next);
    setPanelWidthRaw(clamped);
    savePanelWidth(clamped);
  }, []);

  // Re-clamp (but don't otherwise change) the stored width whenever the viewport is resized, so a
  // panel sized for a wide window doesn't stay wider than a subsequently-shrunk one.
  useEffect(() => {
    function handleResize() {
      setPanelWidthRaw((w) => clampPanelWidth(w));
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const value = useMemo<AssistantContextValue>(
    () => ({
      view,
      mergeView: (partial) => setView((prev) => ({ ...prev, ...partial })),
      isOpen,
      panelTab,
      collapsed,
      panelWidth,
      setPanelWidth,
      pendingPrompt,
      requestedTab,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toggle: () => setIsOpen((prev) => !prev),
      setPanelTab,
      setCollapsed,
      openWithPrompt: (text) => {
        setPanelTab("chat");
        setIsOpen(true);
        setCollapsed(false);
        setPendingPrompt(text);
      },
      consumePendingPrompt: () => setPendingPrompt(null),
      requestNavigate: (tab) => setRequestedTab(tab),
      consumeRequestedTab: () => setRequestedTab(null),
    }),
    [view, isOpen, panelTab, collapsed, panelWidth, setPanelWidth, pendingPrompt, requestedTab],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

function useAssistantContext(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("Assistant hooks must be used within AssistantContextProvider");
  return ctx;
}

export function useAssistantView(): AssistantView {
  return useAssistantContext().view;
}

/** Publishes "where the user is" into the shared assistant context, clearing those same keys on unmount. */
export function useSetAssistantView(view: Partial<AssistantView>): void {
  const { mergeView } = useAssistantContext();
  const viewRef = useRef(view);
  viewRef.current = view;
  const key = JSON.stringify(view);

  useEffect(() => {
    mergeView(viewRef.current);
    return () => {
      const cleared = Object.fromEntries(Object.keys(viewRef.current).map((k) => [k, null]));
      mergeView(cleared);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export function useAssistantPanel() {
  const { isOpen, panelTab, collapsed, open, close, toggle, setPanelTab, setCollapsed } = useAssistantContext();
  return { isOpen, panelTab, collapsed, open, close, toggle, setPanelTab, setCollapsed };
}

/** The expanded panel's user-resizable width — split out from `useAssistantPanel` since only the
 *  widget's own resize handle needs to set it. */
export function useAssistantWidth() {
  const { panelWidth, setPanelWidth } = useAssistantContext();
  return { width: panelWidth, setWidth: setPanelWidth };
}

/**
 * How much horizontal space (px) North Star currently occupies at the right edge of the screen —
 * 0 when closed, the slim rail's width when collapsed, the full panel width when open. North Star
 * itself is `fixed`-positioned (so it can float above everything, including its own launcher
 * bubble), which means the rest of the app has to reserve this space itself, on its own layout
 * root, or North Star ends up overlapping — and clipping — whatever's underneath it.
 */
export function useAssistantReservedWidth(): number {
  const { isOpen, collapsed, panelWidth } = useAssistantContext();
  if (!isOpen) return 0;
  return collapsed ? ASSISTANT_RAIL_WIDTH : panelWidth;
}

export function useAssistantActions() {
  const { openWithPrompt, requestNavigate } = useAssistantContext();
  return { openWithPrompt, requestNavigate };
}

export function usePendingAssistantPrompt() {
  const { pendingPrompt, consumePendingPrompt } = useAssistantContext();
  return { pendingPrompt, consumePendingPrompt };
}

/** Consumed by `Workspace.tsx` to apply (and clear) a tab switch requested by North Star's `navigate` tool. */
export function useRequestedTab() {
  const { requestedTab, consumeRequestedTab } = useAssistantContext();
  return { requestedTab, consumeRequestedTab };
}
