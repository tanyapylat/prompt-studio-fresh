import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Compass, Loader2, Send, Square } from "lucide-react";
import { useStore } from "../../store";
import { useAssistantActions, useAssistantPanel, useAssistantView, usePendingAssistantPrompt, type AssistantView } from "../../assistantContext";
import { assistantChatRemote } from "../../api";
import type { AssistantMessage } from "../../assistantTools";
import { runAssistantTool, type AssistantAgentContext } from "../../assistantAgentActions";
import { matchCcheadlineDemoStep } from "../../assistantCcheadlineDemo";
import { matchCqaDemoStep } from "../../assistantCqaDemo";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";

const BUILD_NEW_SUGGESTION = "Build a new prompt from scratch";
const FEEDBACK_SUGGESTION = "How do I give feedback about AI Studio?";

const TAB_SUGGESTIONS: Record<string, string[]> = {
  prompt: ["What's the difference between the Target and the Playground?"],
  eval: ["When should I use custom_code instead of a rubric?"],
  dataset: ["What's the difference between seed and synthetic rows?"],
  results: ["What's the difference between a full run and a sample run?"],
  review: ["What do I need before I can publish?"],
};

/** Leads with the "build something new" entry point everywhere (per the plan's demo flow), then one contextual tip, then feedback. */
function suggestionsFor(view: AssistantView): string[] {
  const contextual = (view.tab && TAB_SUGGESTIONS[view.tab]) || ["Explain the assertion tiers"];
  return [BUILD_NEW_SUGGESTION, ...contextual.slice(0, 1), FEEDBACK_SUGGESTION];
}

/** Friendly label shown on an action card's header — falls back to the raw tool name for anything unmapped. */
const TOOL_LABELS: Record<string, string> = {
  create_spec: "Created Spec",
  update_spec_fields: "Updated Spec",
  add_spec_items: "Added to Spec",
  generate_artifacts: "Generated",
  run_suite: "Ran eval suite",
  publish_spec: "Published",
  refresh_review_insights: "Reviewed insights",
  log_feedback: "Logged feedback",
  navigate: "Switched tab",
};

/** Which Workspace tab it makes sense to jump to after a given tool succeeds — lets an action card double as a shortcut. */
const TOOL_TARGET_TAB: Record<string, string> = {
  generate_artifacts: "prompt",
  run_suite: "results",
  publish_spec: "review",
  refresh_review_insights: "results",
};

const MAX_TOOL_ROUNDS = 6;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type TimelineEntry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "action"; name: string; ok: boolean; detail: string };

export function AssistantChat() {
  const { selected: spec, addSpec, updateSpec, currentUser } = useStore();
  const view = useAssistantView();
  const { setPanelTab } = useAssistantPanel();
  const { pendingPrompt, consumePendingPrompt } = usePendingAssistantPrompt();
  const { requestNavigate } = useAssistantActions();
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<AssistantMessage[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * The full multi-round agent turn: keeps calling the server while it keeps returning tool calls
   * (executing each one for real against the store via `runAssistantTool`), then renders the final
   * text reply. `workingSpec` threads the Spec across a batch of tool calls within this one turn —
   * `useStore()`'s `spec` won't reflect an earlier `create_spec` in the same batch until next render.
   */
  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setInput("");
    setSending(true);
    setError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setTimeline((t) => [...t, { kind: "user", text: trimmed }]);
    let convo: AssistantMessage[] = [...messagesRef.current, { role: "user", content: trimmed }];
    messagesRef.current = convo;

    let workingSpec = spec ?? null;

    // North Star's one hardcoded demo scenario — checked before the LLM/offline-script loop, in
    // both live and offline mode, so it deterministically reproduces the real seeded example
    // instead of the generic generator's invented approximation of it, one guided step at a time.
    // See `matchCcheadlineDemoStep`; it returns `null` for anything that isn't a recognized next
    // step, so ordinary questions asked mid-flow still fall through to normal handling below.
    const demoStep = matchCcheadlineDemoStep(trimmed, workingSpec) ?? matchCqaDemoStep(trimmed, workingSpec);
    if (demoStep) {
      if (demoStep.intro) setTimeline((t) => [...t, { kind: "assistant", text: demoStep.intro! }]);

      for (const action of demoStep.actions) {
        if (controller.signal.aborted) break;
        await sleep(450);
        setTimeline((t) => [...t, { kind: "action", name: action.name, ok: true, detail: action.summary }]);
      }

      if (!controller.signal.aborted) {
        demoStep.apply(
          (s) => {
            workingSpec = s;
            addSpec(s);
          },
          (s) => {
            workingSpec = s;
            updateSpec(s.id, () => s);
          },
        );
        setTimeline((t) => [...t, { kind: "assistant", text: demoStep.outro }]);
        messagesRef.current = [
          ...convo,
          { role: "assistant", content: [demoStep.intro, demoStep.outro].filter(Boolean).join("\n\n") },
        ];
      }

      setSending(false);
      abortControllerRef.current = null;
      return;
    }

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const res = await assistantChatRemote({
          messages: convo,
          spec: workingSpec,
          view: { section: view.section, tab: view.tab, specName: view.specName, status: view.status },
        });

        if (res.toolCalls && res.toolCalls.length > 0) {
          convo = [...convo, { role: "assistant", content: res.content, toolCalls: res.toolCalls }];
          if (res.content?.trim()) setTimeline((t) => [...t, { kind: "assistant", text: res.content!.trim() }]);

          for (const call of res.toolCalls) {
            const ctx: AssistantAgentContext = {
              spec: workingSpec,
              ownerId: currentUser.id,
              currentUserName: currentUser.name,
              view: { specName: workingSpec?.name ?? view.specName, tab: view.tab, section: view.section },
              signal: controller.signal,
              addSpec: (s) => {
                workingSpec = s;
                addSpec(s);
              },
              setSpec: (s) => {
                workingSpec = s;
                updateSpec(s.id, () => s);
              },
              requestNavigate,
            };
            const result = await runAssistantTool(call.name, call.arguments, ctx);
            setTimeline((t) => [...t, { kind: "action", name: call.name, ok: result.ok, detail: result.summary }]);
            convo = [...convo, { role: "tool", toolCallId: call.id, content: result.summary }];
          }
          messagesRef.current = convo;
          continue;
        }

        convo = [...convo, { role: "assistant", content: res.content ?? "" }];
        messagesRef.current = convo;
        if (res.content?.trim()) setTimeline((t) => [...t, { kind: "assistant", text: res.content!.trim() }]);
        break;
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSending(false);
      abortControllerRef.current = null;
    }
  }

  function handleStop() {
    abortControllerRef.current?.abort();
  }

  // Fires when a pane (e.g. the Eval pane's rubric helper, or an "Ask North Star to…" pill) calls `openWithPrompt`.
  useEffect(() => {
    if (!pendingPrompt) return;
    consumePendingPrompt();
    void send(pendingPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [timeline, sending]);

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
      <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {timeline.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Compass size={20} />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">I'm North Star</p>
              <p className="mt-1 text-xs text-slate-500">
                I can build a Spec, generate a Prompt/Assertions/Dataset, run the suite, publish, and answer
                questions — all from right here.
              </p>
            </div>
            <div className="mt-1 flex w-full flex-col gap-1.5">
              {suggestionsFor(view).map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSuggestion(suggestion)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-700 shadow-sm shadow-slate-900/5 transition-colors hover:border-ring/50 hover:bg-accent"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {timeline.map((entry, i) => {
          if (entry.kind === "action") {
            const targetTab = TOOL_TARGET_TAB[entry.name];
            const clickable = entry.ok && !!spec && !!targetTab;
            return (
              <div key={i} className="flex justify-start">
                <button
                  disabled={!clickable}
                  onClick={() => clickable && requestNavigate(targetTab)}
                  className={clsx(
                    "flex max-w-[85%] items-start gap-2 rounded-xl border px-3 py-2 text-left text-xs",
                    entry.ok
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-rose-200 bg-rose-50 text-rose-700",
                    clickable && "cursor-pointer hover:border-emerald-300",
                    !clickable && "cursor-default",
                  )}
                >
                  {entry.ok ? (
                    <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  )}
                  <span>
                    <span className="font-medium">{TOOL_LABELS[entry.name] ?? entry.name}</span>
                    {" — "}
                    {entry.detail}
                    {clickable && <span className="ml-1 underline">View</span>}
                  </span>
                </button>
              </div>
            );
          }
          return (
            <div key={i} className={clsx("flex", entry.kind === "user" ? "justify-end" : "justify-start")}>
              <div
                className={clsx(
                  "max-w-[85%] rounded-2xl px-3 py-2",
                  entry.kind === "user" ? "bg-primary text-primary-foreground" : "bg-slate-100 text-slate-800",
                )}
              >
                {entry.kind === "user" ? (
                  <p className="whitespace-pre-wrap text-sm">{entry.text}</p>
                ) : (
                  <Markdown text={entry.text} />
                )}
              </div>
            </div>
          );
        })}

        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-xs text-slate-500">
              <Loader2 size={12} className="animate-spin" /> Thinking…
              <button onClick={handleStop} title="Stop" className="text-slate-400 hover:text-rose-600">
                <Square size={11} />
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">{error}</p>
        )}
      </div>

      <div className="flex items-end gap-2 border-t border-slate-200 p-2.5">
        <AutoGrowTextarea
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
        <Button variant="ghost" size="icon" title="Send" onClick={handleSubmit}>
          <Send size={16} className={input.trim() ? "text-primary" : "text-slate-300"} />
        </Button>
      </div>
    </div>
  );
}
