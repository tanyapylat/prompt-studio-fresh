import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { useStore } from "../../store";
import { useAssistantView } from "../../assistantContext";
import { newId } from "../../utils/id";
import { AutoGrowTextArea, Button } from "../ui";

const FEEDBACK_STORAGE_KEY = "compass:feedback:v1";

interface FeedbackEntry {
  id: string;
  text: string;
  context: string;
  submittedBy: string;
  createdAt: number;
}

function readFeedback(): FeedbackEntry[] {
  try {
    const raw = localStorage.getItem(FEEDBACK_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as FeedbackEntry[]) : [];
  } catch {
    return [];
  }
}

function writeFeedback(entries: FeedbackEntry[]) {
  try {
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Feedback is a nice-to-have — losing it silently beats breaking the app when storage is unavailable.
  }
}

/** Product feedback about Compass itself — deliberately local-only (no backend), per how this prototype persists everything else. */
export function AssistantFeedback() {
  const { currentUser } = useStore();
  const view = useAssistantView();
  const [text, setText] = useState("");
  const [entries, setEntries] = useState<FeedbackEntry[]>(() => readFeedback());
  const [justSubmitted, setJustSubmitted] = useState(false);

  useEffect(() => {
    if (!justSubmitted) return;
    const timeout = setTimeout(() => setJustSubmitted(false), 2500);
    return () => clearTimeout(timeout);
  }, [justSubmitted]);

  function describeContext(): string {
    const parts: string[] = [];
    if (view.specName) parts.push(`Spec "${view.specName}"`);
    if (view.tab) parts.push(`${view.tab} tab`);
    if (view.section && !view.specName) parts.push(`${view.section} section`);
    return parts.length > 0 ? parts.join(" / ") : "General";
  }

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const entry: FeedbackEntry = {
      id: newId("feedback"),
      text: trimmed,
      context: describeContext(),
      submittedBy: currentUser.name,
      createdAt: Date.now(),
    };
    const next = [entry, ...entries];
    setEntries(next);
    writeFeedback(next);
    setText("");
    setJustSubmitted(true);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 p-3">
        <p className="text-xs text-slate-500">
          Tell the Compass team what's working, what's confusing, or what's broken.
        </p>
        <AutoGrowTextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What's on your mind?"
          minHeight={64}
          maxHeight={140}
          className="mt-2"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400">Context: {describeContext()}</span>
          <Button size="sm" onClick={submit} disabled={!text.trim()}>
            <Send size={13} /> Submit
          </Button>
        </div>
        {justSubmitted && <p className="mt-1 text-[11px] text-emerald-600">Thanks — saved on this device.</p>}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {entries.length === 0 ? (
          <p className="text-xs text-slate-400">No feedback submitted yet.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <p className="text-xs text-slate-800">{entry.text}</p>
                <p className="mt-1 text-[10px] text-slate-400">
                  {entry.context} · {entry.submittedBy} · {new Date(entry.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
