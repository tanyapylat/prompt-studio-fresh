import clsx from "clsx";
import { Compass, MessageCircleQuestion, ThumbsUp, X } from "lucide-react";
import { useAssistantPanel } from "../../assistantContext";
import { AssistantChat } from "./AssistantChat";
import { AssistantFeedback } from "./AssistantFeedback";

/**
 * The app-wide "North Star" guidance assistant — a floating bubble that expands into a docked
 * panel, mounted once at the Shell level (see `App.tsx`) so it survives navigation between Home,
 * Dashboard, Workspace, and the Playground. Both tabs stay mounted at all times (just visually
 * hidden) so chat history and draft feedback text survive closing/reopening the widget.
 */
export function AssistantWidget() {
  const { isOpen, panelTab, toggle, close, setPanelTab } = useAssistantPanel();

  return (
    <>
      <div
        className={clsx(
          "fixed bottom-20 right-6 z-40 flex w-[380px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15 transition-all duration-150",
          isOpen ? "h-[560px] max-h-[75vh] opacity-100" : "pointer-events-none h-0 opacity-0",
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-600 text-white">
              <Compass size={14} />
            </span>
            <div>
              <p className="text-sm font-semibold leading-tight text-slate-900">North Star</p>
              <p className="text-[11px] leading-tight text-slate-400">Your guide through Compass</p>
            </div>
          </div>
          <button
            onClick={close}
            title="Close"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex shrink-0 gap-1 border-b border-slate-200 px-2 pt-1.5">
          <button
            onClick={() => setPanelTab("chat")}
            className={clsx(
              "flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-1.5 text-xs font-medium transition-colors",
              panelTab === "chat"
                ? "border-sky-500 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            <MessageCircleQuestion size={13} /> Chat
          </button>
          <button
            onClick={() => setPanelTab("feedback")}
            className={clsx(
              "flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-1.5 text-xs font-medium transition-colors",
              panelTab === "feedback"
                ? "border-sky-500 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            <ThumbsUp size={13} /> Feedback
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

      <button
        onClick={toggle}
        title="North Star — your Compass guide"
        className={clsx(
          "fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full shadow-lg shadow-sky-900/25 transition-transform hover:scale-105",
          isOpen ? "bg-slate-800 text-white" : "bg-sky-600 text-white",
        )}
      >
        {isOpen ? <X size={20} /> : <Compass size={20} />}
      </button>
    </>
  );
}
