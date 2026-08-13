import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type AssistantPanelTab = "chat" | "feedback";

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
  /** A question queued by `openWithPrompt` (e.g. from the Eval pane's rubric helper) for the chat panel to send. */
  pendingPrompt: string | null;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setPanelTab: (tab: AssistantPanelTab) => void;
  openWithPrompt: (text: string) => void;
  consumePendingPrompt: () => void;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function AssistantContextProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<AssistantView>(EMPTY_VIEW);
  const [isOpen, setIsOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<AssistantPanelTab>("chat");
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  const value = useMemo<AssistantContextValue>(
    () => ({
      view,
      mergeView: (partial) => setView((prev) => ({ ...prev, ...partial })),
      isOpen,
      panelTab,
      pendingPrompt,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toggle: () => setIsOpen((prev) => !prev),
      setPanelTab,
      openWithPrompt: (text) => {
        setPanelTab("chat");
        setIsOpen(true);
        setPendingPrompt(text);
      },
      consumePendingPrompt: () => setPendingPrompt(null),
    }),
    [view, isOpen, panelTab, pendingPrompt],
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
  const { isOpen, panelTab, open, close, toggle, setPanelTab } = useAssistantContext();
  return { isOpen, panelTab, open, close, toggle, setPanelTab };
}

export function useAssistantActions() {
  const { openWithPrompt } = useAssistantContext();
  return { openWithPrompt };
}

export function usePendingAssistantPrompt() {
  const { pendingPrompt, consumePendingPrompt } = useAssistantContext();
  return { pendingPrompt, consumePendingPrompt };
}
