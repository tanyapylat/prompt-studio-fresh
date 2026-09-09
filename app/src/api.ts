import type {
  Assertion,
  DatasetItem,
  GenerateSelection,
  GenerationMode,
  JudgePolicy,
  RunInsights,
  RunItemResult,
  SpecProject,
  TargetVersion,
} from "./types";
import type { AssistantMessage, AssistantToolCall, AssistantViewContext } from "./assistantTools";

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const responseBody = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof responseBody?.error === "string"
        ? responseBody.error
        : `Request to ${path} failed (${res.status})`;
    throw new Error(message);
  }
  return responseBody as T;
}

export interface GenerateResponse {
  target?: TargetVersion;
  assertions?: Assertion[];
  judge?: JudgePolicy | null;
  dataset?: DatasetItem[];
  mode: GenerationMode;
}

export function generateBundleRemote(
  spec: SpecProject,
  selection: GenerateSelection,
  signal?: AbortSignal,
): Promise<GenerateResponse> {
  return post<GenerateResponse>("/api/generate", { spec, selection }, signal);
}

export interface RunResponse {
  results: RunItemResult[];
  mode: GenerationMode;
}

/** `itemIds`, when provided and non-empty, scores only that subset of the Dataset — a sample run. */
export function runSuiteRemote(spec: SpecProject, itemIds?: string[], signal?: AbortSignal): Promise<RunResponse> {
  return post<RunResponse>("/api/run", { spec, itemIds }, signal);
}

export interface SuggestReviewInsightsResponse {
  insights: RunInsights;
  mode: GenerationMode;
}

/** Opt-in, deeper "what to review first / how to improve" pass over a Run — the free heuristic version runs client-side instead. */
export function suggestReviewInsightsRemote(spec: SpecProject, runId: string): Promise<SuggestReviewInsightsResponse> {
  return post<SuggestReviewInsightsResponse>("/api/suggest-review-insights", { spec, runId });
}

export interface PlaygroundChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface PlaygroundToolSpec {
  name: string;
  description: string;
  parameters: unknown;
}

export interface PlaygroundResponseFormat {
  name: string;
  schema: unknown;
}

export interface PlaygroundSettings {
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number;
  stopSequences?: string[];
  /** Parsed client-side from the raw JSON text the user edits, same convention as tool parameters. */
  logitBias?: Record<string, number>;
  timeoutMs?: number;
}

export interface PlaygroundRunRequest {
  messages: PlaygroundChatMessage[];
  model: string;
  temperature: number;
  tools?: PlaygroundToolSpec[];
  responseFormat?: PlaygroundResponseFormat | null;
  settings?: PlaygroundSettings;
}

export interface PlaygroundToolCall {
  name: string;
  arguments: string;
}

export interface PlaygroundUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface PlaygroundRunResponse {
  content: string | null;
  toolCalls?: PlaygroundToolCall[];
  mode: GenerationMode;
  usage: PlaygroundUsage;
  latencyMs: number;
  costUsd: number;
}

/** Ad-hoc Playground tester — multi-message, tools, and structured output; not tied to any Spec's dataset/assertions. */
export async function runPlaygroundRemote(opts: PlaygroundRunRequest): Promise<PlaygroundRunResponse> {
  const res = await fetch("/api/playground-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof body?.error === "string" ? body.error : `Request to /api/playground-run failed (${res.status})`;
    throw new Error(message);
  }
  return body as PlaygroundRunResponse;
}

export async function checkApiHealth(): Promise<{ hasApiKey: boolean }> {
  try {
    const res = await fetch("/api/health");
    return await res.json();
  } catch {
    return { hasApiKey: false };
  }
}

export interface AssistantChatResponse {
  content: string | null;
  toolCalls?: AssistantToolCall[];
  mode: GenerationMode;
}

/**
 * North Star's agentic turn — sends the running conversation (including any prior tool calls/
 * results) plus whichever Spec/view is currently in scope, and gets back either a final text reply
 * or tool calls for the client to execute (see `assistantAgentActions.ts`) before calling again.
 */
export function assistantChatRemote(opts: {
  messages: AssistantMessage[];
  spec?: SpecProject | null;
  view?: AssistantViewContext | null;
}): Promise<AssistantChatResponse> {
  return post<AssistantChatResponse>("/api/assistant-chat", opts);
}
