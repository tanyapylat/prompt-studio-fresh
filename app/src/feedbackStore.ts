import { newId } from "./utils/id";

const FEEDBACK_STORAGE_KEY = "ai-studio:feedback:v1";

export interface FeedbackEntry {
  id: string;
  text: string;
  context: string;
  submittedBy: string;
  createdAt: number;
}

/**
 * Product feedback about AI Studio itself — deliberately local-only (no backend), per how this
 * prototype persists everything else. Shared between the Feedback tab (`AssistantFeedback.tsx`,
 * which lists/submits it by hand) and North Star's `log_feedback` tool (which submits it from chat).
 */
export function readFeedback(): FeedbackEntry[] {
  try {
    const raw = localStorage.getItem(FEEDBACK_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as FeedbackEntry[]) : [];
  } catch {
    return [];
  }
}

export function writeFeedback(entries: FeedbackEntry[]) {
  try {
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Feedback is a nice-to-have — losing it silently beats breaking the app when storage is unavailable.
  }
}

export function logFeedback(text: string, context: string, submittedBy: string): FeedbackEntry {
  const entry: FeedbackEntry = { id: newId("feedback"), text, context, submittedBy, createdAt: Date.now() };
  writeFeedback([entry, ...readFeedback()]);
  return entry;
}
