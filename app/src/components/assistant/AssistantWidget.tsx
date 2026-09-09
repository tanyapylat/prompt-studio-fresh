import { useEffect, useRef } from "react";
import clsx from "clsx";
import { Compass, MessageCircleQuestion, PanelRightClose, ThumbsUp, X } from "lucide-react";
import {
  ASSISTANT_RAIL_WIDTH,
  useAssistantPanel,
  useAssistantView,
  useAssistantWidth,
  type AssistantView,
} from "../../assistantContext";
import { AssistantChat } from "./AssistantChat";
import { AssistantFeedback } from "./AssistantFeedback";

/** "Your guide across AI Studio" plus whatever the user is currently looking at, when known. */
function subtitleFor(view: AssistantView): string {
  const base = "Your guide across AI Studio";
  if (view.specName) return `${base} · ${view.specName}`;
  if (view.section) return `${base} · ${view.section.charAt(0).toUpperCase()}${view.section.slice(1)}`;
  return base;
}

/**
 * The app-wide "North Star" agentic concierge — a floating launcher bubble that expands into a
 * huge, full-height panel docked to the right edge (not a small popup) since it's meant to carry
 * real work — building Specs, generating/running/publishing — not just quick Q&A. Its left edge is
 * a drag handle so it can be expanded further when a conversation needs more room, and it can be
 * collapsed to a slim icon rail (staying visibly "present") without fully closing it. Mounted once
 * at the Shell level (see `App.tsx`) so it survives navigation between Home, Dashboard, Workspace,
 * and the Playground. Both tabs stay mounted at all times (just visually hidden) so chat history
 * and draft feedback text survive closing/reopening/collapsing the widget.
 */
export function AssistantWidget() {
  const { isOpen, panelTab, collapsed, toggle, close, setPanelTab, setCollapsed } = useAssistantPanel();
  const { width, setWidth } = useAssistantWidth();
  const view = useAssistantView();
  const widthRef = useRef(width);
  const resizeStartRef = useRef<{ pointerId: number; x: number; width: number } | null>(null);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  function handleResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeStartRef.current = { pointerId: e.pointerId, x: e.clientX, width: widthRef.current };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function handleResizePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const start = resizeStartRef.current;
    if (!start || start.pointerId !== e.pointerId) return;
    // The panel is right-docked, so dragging the handle left (smaller clientX) grows it.
    setWidth(start.width + (start.x - e.clientX));
  }

  function handleResizePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    resizeStartRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  if (isOpen && collapsed) {
    return (
      <div
        className="fixed inset-y-0 right-0 z-40 flex w-14 flex-col items-center gap-3 border-l border-slate-200 bg-white py-4 shadow-2xl shadow-slate-900/10"
        style={{ width: ASSISTANT_RAIL_WIDTH }}
      >
        <button
          onClick={() => setCollapsed(false)}
          title="Expand North Star"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105"
        >
          <Compass size={18} />
        </button>
        <button
          onClick={close}
          title="Close"
          className="mt-auto rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        className={clsx(
          "fixed inset-y-0 right-0 z-40 flex flex-col border-l border-slate-200 bg-white shadow-2xl shadow-slate-900/10 transition-opacity duration-150",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        style={{ width }}
      >
        <div
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          title="Drag to resize"
          className="absolute left-0 top-0 h-full w-1.5 -translate-x-1/2 cursor-col-resize touch-none hover:bg-primary/20"
        />

        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Compass size={18} />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-base font-semibold leading-tight text-slate-900">
                <span className="truncate">North Star</span>
                <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent-foreground">
                  Beta
                </span>
              </p>
              <p className="truncate text-xs leading-tight text-slate-400">{subtitleFor(view)}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
            <button
              onClick={() => setPanelTab("chat")}
              className={clsx(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                panelTab === "chat" ? "bg-primary text-primary-foreground" : "text-slate-500 hover:text-slate-800",
              )}
            >
              <MessageCircleQuestion size={13} /> Chat
            </button>
            <button
              onClick={() => setPanelTab("feedback")}
              className={clsx(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                panelTab === "feedback" ? "bg-primary text-primary-foreground" : "text-slate-500 hover:text-slate-800",
              )}
            >
              <ThumbsUp size={13} /> Feedback
            </button>
          </div>

          <button
            onClick={() => setCollapsed(true)}
            title="Collapse"
            className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <PanelRightClose size={17} />
          </button>
          <button
            onClick={close}
            title="Close"
            className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1">
          <div className={clsx("h-full", panelTab === "chat" ? "block" : "hidden")}>
            <AssistantChat />
          </div>
          <div className={clsx("h-full", panelTab === "feedback" ? "block" : "hidden")}>
            <AssistantFeedback />
          </div>
        </div>
      </div>

      {!isOpen && (
        <button
          onClick={toggle}
          title="North Star — build, generate, run, and publish right from chat"
          className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:scale-105"
        >
          <Compass size={20} />
        </button>
      )}
    </>
  );
}
