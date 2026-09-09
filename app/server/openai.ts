import type { RunInsights, SpecProject } from "../src/types";
import { DEFAULT_JUDGE_SYSTEM_PROMPT, DEFAULT_JUDGE_TEMPERATURE } from "../src/judgeDefaults";
import { ASSISTANT_SYSTEM_PROMPT } from "../src/assistantKnowledge";
import { ASSISTANT_TOOLS, type AssistantMessage, type AssistantToolCall, type AssistantViewContext } from "../src/assistantTools";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Some environments end up with OPENAI_API_KEY literally set to the string "undefined"/"null"
 * (e.g. a shell env var built from an unset variable elsewhere on the machine) — treat that the
 * same as unset rather than sending it to OpenAI and getting a confusing 401.
 */
function getApiKey(): string | undefined {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key === "undefined" || key === "null") return undefined;
  return key;
}

export function hasApiKey(): boolean {
  return !!getApiKey();
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  /** Set on an `assistant` message that requested tool calls — content is typically null alongside this. */
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  /** Set on a `tool` message — correlates this result back to the `tool_calls` entry that requested it. */
  tool_call_id?: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: unknown;
}

export interface ResponseFormatSpec {
  name: string;
  schema: unknown;
}

/** The Playground's "Config gear" — every field optional so it degrades to provider defaults. */
export interface CompletionSettings {
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number;
  stopSequences?: string[];
  logitBias?: Record<string, number>;
  timeoutMs?: number;
}

export interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatCompletionResult {
  content: string | null;
  toolCalls?: AssistantToolCall[];
  usage: UsageInfo;
}

/**
 * Low-level completion call that can return tool calls with no content (the Playground's needs).
 * `chatComplete` below is the simpler wrapper every other caller uses, which just wants text back.
 */
async function chatCompleteRaw(opts: {
  model: string;
  temperature?: number;
  messages: ChatMessage[];
  jsonMode?: boolean;
  tools?: ToolSpec[];
  responseFormat?: ResponseFormatSpec | null;
  settings?: CompletionSettings;
}): Promise<ChatCompletionResult> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const s = opts.settings;
  const body: Record<string, unknown> = {
    model: opts.model,
    temperature: opts.temperature ?? 0.7,
    messages: opts.messages,
  };
  if (opts.jsonMode) {
    body.response_format = { type: "json_object" };
  } else if (opts.responseFormat) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: opts.responseFormat.name || "output", schema: opts.responseFormat.schema, strict: true },
    };
  }
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }
  if (s?.maxTokens !== undefined) body.max_completion_tokens = s.maxTokens;
  if (s?.topP !== undefined) body.top_p = s.topP;
  if (s?.frequencyPenalty !== undefined) body.frequency_penalty = s.frequencyPenalty;
  if (s?.presencePenalty !== undefined) body.presence_penalty = s.presencePenalty;
  if (s?.seed !== undefined) body.seed = s.seed;
  if (s?.stopSequences && s.stopSequences.length > 0) body.stop = s.stopSequences;
  if (s?.logitBias && Object.keys(s.logitBias).length > 0) body.logit_bias = s.logitBias;

  const controller = new AbortController();
  const timeout = s?.timeoutMs ? setTimeout(() => controller.abort(), s.timeoutMs) : null;

  let res: Response;
  try {
    res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`Request timed out after ${s?.timeoutMs}ms`);
    }
    throw e;
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`OpenAI API error ${res.status}: ${errBody.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
      };
    }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error("OpenAI response had no message");

  const toolCalls = message.tool_calls
    ?.map((tc) => ({ id: tc.id ?? "", name: tc.function?.name ?? "", arguments: tc.function?.arguments ?? "{}" }))
    .filter((tc) => tc.name.length > 0);

  const promptTokens = data.usage?.prompt_tokens ?? 0;
  const completionTokens = data.usage?.completion_tokens ?? 0;

  return {
    content: typeof message.content === "string" ? message.content : null,
    toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: data.usage?.total_tokens ?? promptTokens + completionTokens,
    },
  };
}

async function chatComplete(opts: {
  model: string;
  temperature?: number;
  messages: ChatMessage[];
  jsonMode?: boolean;
}): Promise<string> {
  const { content } = await chatCompleteRaw(opts);
  if (typeof content !== "string") throw new Error("OpenAI response had no message content");
  return content;
}

function ioFieldBrief(f: { name: string; type: string; required: boolean; description: string }): string {
  return `- ${f.name} (${f.type}${f.required ? ", required" : ", optional"})${f.description ? `: ${f.description}` : ""}`;
}

export function specBrief(spec: SpecProject): string {
  const lines: string[] = [];
  lines.push(`Name: ${spec.name}`);
  lines.push(`Goal: ${spec.goal || "(not provided)"}`);
  if (spec.context) lines.push(`Context: ${spec.context}`);
  if (spec.inputFields.length) {
    lines.push(`Input contract:`);
    spec.inputFields.forEach((f) => lines.push(ioFieldBrief(f)));
  } else {
    lines.push(`Input contract: (not provided)`);
  }
  if (spec.outputFields.length) {
    const modeNote = spec.outputMode === "tool_call" ? ` — delivered via a forced tool call${spec.outputToolName ? ` (${spec.outputToolName})` : ""}` : spec.outputMode === "json_schema" ? " — delivered as JSON" : " — delivered as plain text";
    lines.push(`Output contract${modeNote}:`);
    spec.outputFields.forEach((f) => lines.push(ioFieldBrief(f)));
  } else {
    lines.push(`Output contract: (not provided)`);
  }
  if (spec.requirements.length) {
    lines.push(`Requirements (things the output must always or must never do):`);
    spec.requirements.forEach((r) => lines.push(`- ${r.name}: ${r.statement}`));
  }
  if (spec.examples.length) {
    lines.push(`Worked examples:`);
    spec.examples.forEach((e) => {
      lines.push(`- Input: ${e.input}`);
      if (e.expectedOutput) lines.push(`  Expected output: ${e.expectedOutput}`);
      if (e.comment) lines.push(`  Why: ${e.comment}`);
    });
  }
  const unresolved = spec.openQuestions.filter((q) => !q.resolved);
  if (unresolved.length) {
    lines.push(`Open questions (unresolved — flag if relevant, don't silently assume an answer):`);
    unresolved.forEach((q) => lines.push(`- ${q.text}`));
  }
  return lines.join("\n");
}

/** Drafts a production-ready system prompt directly from the Spec brief. */
export async function draftPromptWithLLM(spec: SpecProject, model: string): Promise<string> {
  const content = await chatComplete({
    model,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "You are an expert prompt engineer. Given a structured product brief (a 'Spec'), write the " +
          "system prompt for the LLM that will actually perform this task in production. " +
          "Write ONLY the system prompt itself — no preamble, no markdown fences, no commentary about " +
          "what you wrote. Bake every requirement into clear, direct instructions. " +
          "If the output contract specifies a strict format (e.g. a single enum value, or JSON), state " +
          "that constraint unambiguously and show the exact output format at the end.",
      },
      { role: "user", content: specBrief(spec) },
    ],
  });
  return content.trim();
}

/** Generates realistic, diverse synthetic test inputs (not outputs) for the Dataset. */
export async function generateDatasetWithLLM(spec: SpecProject, count: number): Promise<string[]> {
  if (count <= 0) return [];
  const content = await chatComplete({
    model: "gpt-4o-mini",
    temperature: 0.9,
    jsonMode: true,
    messages: [
      {
        role: "system",
        content:
          "You write realistic test cases for evaluating an LLM prompt. Given a Spec brief, produce " +
          `exactly ${count} diverse, realistic sample INPUTS that a real user/system would send to this ` +
          "prompt in production. Deliberately include edge cases and situations implied by the requirements " +
          "(the kind of input that would tempt the model to violate one) — don't just repeat the " +
          "worked examples. Respond as JSON: {\"items\": [\"input 1\", \"input 2\", ...]}. Each item is the " +
          "raw input text only, no labels or numbering.",
      },
      { role: "user", content: specBrief(spec) },
    ],
  });
  try {
    const parsed = JSON.parse(content) as { items?: unknown };
    if (Array.isArray(parsed.items)) {
      return parsed.items.filter((x): x is string => typeof x === "string").slice(0, count);
    }
  } catch {
    // fall through
  }
  return [];
}

/** Runs the actual drafted prompt against one dataset input — a real completion, not a simulation. */
export async function runTargetWithLLM(opts: {
  promptContent: string;
  model: string;
  temperature: number;
  input: string;
  settings?: CompletionSettings;
}): Promise<{ content: string; usage: UsageInfo }> {
  const { content, usage } = await chatCompleteRaw({
    model: opts.model,
    temperature: opts.temperature,
    messages: [
      { role: "system", content: opts.promptContent },
      { role: "user", content: opts.input },
    ],
    settings: opts.settings,
  });
  if (typeof content !== "string") throw new Error("OpenAI response had no message content");
  return { content: content.trim(), usage };
}

/** Runs the Playground's structured, multi-message template — supports tools and a JSON output schema. */
export async function runPlaygroundWithLLM(opts: {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  model: string;
  temperature: number;
  tools?: ToolSpec[];
  responseFormat?: ResponseFormatSpec | null;
  settings?: CompletionSettings;
}): Promise<ChatCompletionResult> {
  return chatCompleteRaw({
    model: opts.model,
    temperature: opts.temperature,
    messages: opts.messages,
    tools: opts.tools,
    responseFormat: opts.responseFormat,
    settings: opts.settings,
  });
}

/** LLM-as-judge grading for a rubric_grading assertion, against the real output. */
export async function judgeWithLLM(opts: {
  rubric: string;
  input: string;
  output: string;
  model: string;
  /** Judge Policy override of the grading instructions — falls back to `DEFAULT_JUDGE_SYSTEM_PROMPT`. */
  systemPrompt?: string;
  /** Judge Policy override of the grading temperature — falls back to `DEFAULT_JUDGE_TEMPERATURE`. */
  temperature?: number;
}): Promise<{ passed: boolean; reason: string; score?: number }> {
  const content = await chatComplete({
    model: opts.model,
    temperature: opts.temperature ?? DEFAULT_JUDGE_TEMPERATURE,
    jsonMode: true,
    messages: [
      {
        role: "system",
        content: opts.systemPrompt?.trim() || DEFAULT_JUDGE_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: `Rubric: ${opts.rubric}\n\nInput: ${opts.input}\n\nOutput: ${opts.output}`,
      },
    ],
  });
  try {
    const parsed = JSON.parse(content) as { passed?: unknown; reason?: unknown; score?: unknown };
    const score = typeof parsed.score === "number" && parsed.score >= 0 && parsed.score <= 1 ? parsed.score : undefined;
    return {
      passed: !!parsed.passed,
      reason: typeof parsed.reason === "string" ? parsed.reason : "Judge did not return a reason.",
      score,
    };
  } catch {
    return { passed: false, reason: "Judge response could not be parsed as JSON." };
  }
}

/** Compact per-assertion summary for the assistant's context — the tier plus whichever field carries its actual logic. */
function assertionBrief(spec: SpecProject): string[] {
  return spec.assertions.map((a, i) => {
    const detail =
      a.tier === "rubric_grading"
        ? a.rubric?.trim() || "(empty rubric)"
        : a.tier === "custom_code"
          ? `${a.codeLanguage ?? "javascript"} custom check — ${a.description || "(no description)"}`
          : a.description || "(no description)";
    return `${i + 1}. [${a.tier}]${a.group ? ` (${a.group})` : ""} ${detail}`;
  });
}

/** Converts the client's isomorphic `AssistantMessage` log into OpenAI's wire format, including tool_calls/tool_call_id. */
function toWireMessage(m: AssistantMessage): ChatMessage {
  if (m.role === "assistant") {
    return {
      role: "assistant",
      content: m.content,
      tool_calls: m.toolCalls?.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    };
  }
  if (m.role === "tool") {
    return { role: "tool", content: m.content, tool_call_id: m.toolCallId };
  }
  return { role: "user", content: m.content };
}

export interface AssistantAgentTurnResult {
  content: string | null;
  toolCalls?: AssistantToolCall[];
}

/**
 * North Star's live agentic turn — grounds `ASSISTANT_SYSTEM_PROMPT` with whichever Spec/tab the
 * user is currently looking at, and offers the full tool catalog so the model can act (create a
 * Spec, generate/run/publish, etc.) rather than only describe what to do. The client owns the
 * conversation and executes any returned `toolCalls` itself (there's no server-side data store),
 * then calls this again with the tool results appended to continue the same turn.
 */
export async function assistantAgentTurn(opts: {
  messages: AssistantMessage[];
  spec?: SpecProject | null;
  view?: AssistantViewContext | null;
}): Promise<AssistantAgentTurnResult> {
  const contextLines: string[] = [];
  if (opts.spec) {
    contextLines.push(`Current Spec brief:\n${specBrief(opts.spec)}`);
    if (opts.view?.tab === "eval" && opts.spec.assertions.length > 0) {
      contextLines.push(`Current assertions:\n${assertionBrief(opts.spec).join("\n")}`);
    }
    contextLines.push(
      `Spec state: Prompt ${opts.spec.target ? `generated (${opts.spec.target.status})` : "not generated yet"}; ` +
        `${opts.spec.assertions.length} assertion(s); ${opts.spec.dataset.length} dataset row(s); ${opts.spec.runs.length} run(s).`,
    );
  } else {
    contextLines.push("No Spec is currently open — the user is browsing lists/library/dashboard. Use create_spec if they want to build something new.");
  }
  if (opts.view?.section) contextLines.push(`Current section: "${opts.view.section}".`);
  if (opts.view?.tab) contextLines.push(`The user is currently on the "${opts.view.tab}" tab.`);

  const result = await chatCompleteRaw({
    model: "gpt-4o-mini",
    temperature: 0.4,
    tools: ASSISTANT_TOOLS,
    messages: [
      { role: "system", content: `${ASSISTANT_SYSTEM_PROMPT}\n\n## Current context\n${contextLines.join("\n\n")}` },
      ...opts.messages.map(toWireMessage),
    ],
  });
  return { content: result.content, toolCalls: result.toolCalls };
}

/**
 * Deeper, opt-in "what to review first / how to improve" pass over a finished Run — a richer
 * alternative to `engine.ts`'s free `suggestRunInsightsHeuristic`. `resultsBrief` is a pre-built,
 * bounded text summary (failing rows + assertion fail rates) so this never ships full transcripts
 * of every row to the model. `validItemIds` guards against the model inventing a row id that
 * doesn't exist in this Run.
 */
export async function suggestReviewInsightsWithLLM(opts: {
  specBrief: string;
  resultsBrief: string;
  validItemIds: string[];
}): Promise<RunInsights> {
  const content = await chatComplete({
    model: "gpt-4o-mini",
    temperature: 0.3,
    jsonMode: true,
    messages: [
      {
        role: "system",
        content:
          "You help a prompt engineer triage the results of an eval run. Given the Spec brief and a " +
          "summary of failing rows/checks, identify: (1) up to 5 rows most worth reviewing first, by " +
          "their exact row id, with a one-sentence reason each; (2) up to 4 concrete, specific " +
          "suggestions for improving the prompt or checks (not generic advice). Respond as JSON: " +
          '{"reviewFirst": [{"datasetItemId": "<exact id from the summary>", "reason": "..."}], ' +
          '"improvements": ["...", "..."]}. Only use row ids that literally appear in the summary.',
      },
      { role: "user", content: `${opts.specBrief}\n\n${opts.resultsBrief}` },
    ],
  });
  try {
    const parsed = JSON.parse(content) as { reviewFirst?: unknown; improvements?: unknown };
    const validIds = new Set(opts.validItemIds);
    const reviewFirst = Array.isArray(parsed.reviewFirst)
      ? parsed.reviewFirst
          .filter(
            (r): r is { datasetItemId: string; reason: string } =>
              !!r &&
              typeof r === "object" &&
              typeof (r as Record<string, unknown>).datasetItemId === "string" &&
              typeof (r as Record<string, unknown>).reason === "string" &&
              validIds.has((r as { datasetItemId: string }).datasetItemId),
          )
          .slice(0, 5)
      : [];
    const improvements = Array.isArray(parsed.improvements)
      ? parsed.improvements.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 4)
      : [];
    return { reviewFirst, improvements };
  } catch {
    return { reviewFirst: [], improvements: [] };
  }
}
