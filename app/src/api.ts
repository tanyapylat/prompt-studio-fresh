import type {
  Assertion,
  DatasetItem,
  GenerateSelection,
  GenerationMode,
  JudgePolicy,
  RunItemResult,
  SpecProject,
  TargetVersion,
} from "./types";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

export function generateBundleRemote(spec: SpecProject, selection: GenerateSelection): Promise<GenerateResponse> {
  return post<GenerateResponse>("/api/generate", { spec, selection });
}

export interface RunResponse {
  results: RunItemResult[];
  mode: GenerationMode;
}

/** `itemIds`, when provided and non-empty, scores only that subset of the Dataset — a sample run. */
export function runSuiteRemote(spec: SpecProject, itemIds?: string[]): Promise<RunResponse> {
  return post<RunResponse>("/api/run", { spec, itemIds });
}

export interface SuggestPowersResponse {
  tags: string[];
  mode: GenerationMode;
}

export function suggestPowersRemote(spec: SpecProject): Promise<SuggestPowersResponse> {
  return post<SuggestPowersResponse>("/api/suggest-powers", { spec });
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

export interface PlaygroundRunRequest {
  messages: PlaygroundChatMessage[];
  model: string;
  temperature: number;
  tools?: PlaygroundToolSpec[];
  responseFormat?: PlaygroundResponseFormat | null;
}

export interface PlaygroundToolCall {
  name: string;
  arguments: string;
}

export interface PlaygroundRunResponse {
  content: string | null;
  toolCalls?: PlaygroundToolCall[];
  mode: GenerationMode;
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

export interface AssistantChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantChatResponse {
  content: string;
  mode: GenerationMode;
}

/** North Star's chat turn — sends the running conversation plus whichever Spec/tab is currently in view. */
export function assistantChatRemote(opts: {
  messages: AssistantChatMessage[];
  spec?: SpecProject | null;
  tab?: string | null;
}): Promise<AssistantChatResponse> {
  return post<AssistantChatResponse>("/api/assistant-chat", opts);
}
