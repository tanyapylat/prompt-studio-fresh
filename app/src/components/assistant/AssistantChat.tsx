import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Compass, Loader2, Send, ZapOff } from "lucide-react";
import { useStore } from "../../store";
import { useAssistantPanel, useAssistantView, usePendingAssistantPrompt, type AssistantView } from "../../assistantContext";
import { assistantChatRemote, type AssistantChatMessage } from "../../api";
import { AutoGrowTextArea, IconButton } from "../ui";

const FEEDBACK_SUGGESTION = "How do I give feedback about Compass?";

const TAB_SUGGESTIONS: Record<string, string[]> = {
  prompt: [
    "How do I edit the generated system prompt?",
    "What's the difference between the Target and the Playground?",
  ],
  eval: [
    "Help me tune this rubric's wording",
    "When should I use custom_code instead of a rubric?",
    "Why might a rubric-grading assertion be flaky?",
  ],
  dataset: [
    "How do I import a dataset from a file?",
    "What's the difference between seed and synthetic rows?",
  ],
  results: ["How do I read the pass-rate rollup?", "What's a citable run?"],
  review: ["What do I need before I can Publish?", "How do I respond to review comments?"],
};

function suggestionsFor(view: AssistantView): string[] {
  const base = (view.tab && TAB_SUGGESTIONS[view.tab]) || ["How do I start a new Spec?", "Explain the assertion tiers"];
  return [...base.slice(0, 2), FEEDBACK_SUGGESTION];
}

export function AssistantChat() {
  const { selected: spec } = useStore();
  const view = useAssistantView();
  const { setPanelTab } = useAssistantPanel();
  const { pendingPrompt, consumePendingPrompt } = usePendingAssistantPrompt();
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const next = [...messages, { role: "user", content: trimmed } as AssistantChatMessage];
    setMessages(next);
    setInput("");
    setSending(true);
    setError(null);
    try {
      const res = await assistantChatRemote({ messages: next, spec: spec ?? null, tab: view.tab });
      setSimulated(res.mode === "simulated");
      setMessages((prev) => [...prev, { role: "assistant", content: res.content }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  // Fires when a pane (e.g. the Eval pane's rubric helper) calls `openWithPrompt` — asks it immediately.
  useEffect(() => {
    if (!pendingPrompt) return;
    consumePendingPrompt();
    void send(pendingPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  function handleSuggestion(text: string) {
    if (text === FEEDBACK_SUGGESTION) {
      setPanelTab("feedback");
      return;
    }
    void send(text);
  }

  function handleSubmit() {
    void send(input);
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-50 text-sky-600">
              <Compass size={20} />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">I'm North Star</p>
              <p className="mt-1 text-xs text-slate-500">
                Ask me about Specs, assertions, troubleshooting a run, or anything else in Compass.
              </p>
            </div>
            <div className="mt-1 flex w-full flex-col gap-1.5">
              {suggestionsFor(view).map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSuggestion(suggestion)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-700 shadow-sm shadow-slate-900/5 transition-colors hover:border-sky-300 hover:bg-sky-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, i) => (
          <div key={i} className={clsx("flex", message.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={clsx(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                message.role === "user" ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-800",
              )}
            >
              {message.content}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-2xl bg-slate-100 px-3 py-2 text-xs text-slate-500">
              <Loader2 size={12} className="animate-spin" /> Thinking…
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">{error}</p>
        )}
      </div>

      {simulated && (
        <div className="flex items-center gap-1.5 border-t border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">
          <ZapOff size={11} /> Simulated mode — add OPENAI_API_KEY in app/.env for live guidance.
        </div>
      )}

      <div className="flex items-end gap-2 border-t border-slate-200 p-2.5">
        <AutoGrowTextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Ask North Star…"
          minHeight={38}
          maxHeight={120}
          className="flex-1"
        />
        <IconButton title="Send" onClick={handleSubmit}>
          <Send size={16} className={input.trim() ? "text-sky-600" : "text-slate-300"} />
        </IconButton>
      </div>
    </div>
  );
}
