import type { SpecProject } from "../src/types";
import { DEFAULT_JUDGE_SYSTEM_PROMPT, DEFAULT_JUDGE_TEMPERATURE } from "../src/judgeDefaults";
import { ASSISTANT_SYSTEM_PROMPT } from "../src/assistantKnowledge";

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
  role: "system" | "user" | "assistant";
  content: string;
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

interface ChatCompletionResult {
  content: string | null;
  toolCalls?: { name: string; arguments: string }[];
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
}): Promise<ChatCompletionResult> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

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

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`OpenAI API error ${res.status}: ${errBody.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: { function?: { name?: string; arguments?: string } }[];
      };
    }[];
  };
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error("OpenAI response had no message");

  const toolCalls = message.tool_calls
    ?.map((tc) => ({ name: tc.function?.name ?? "", arguments: tc.function?.arguments ?? "{}" }))
    .filter((tc) => tc.name.length > 0);

  return {
    content: typeof message.content === "string" ? message.content : null,
    toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
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

export function specBrief(spec: SpecProject): string {
  const lines: string[] = [];
  lines.push(`Name: ${spec.name}`);
  lines.push(`Goal / business context: ${spec.goal || "(not provided)"}`);
  lines.push(`Input contract: ${spec.inputContract || "(not provided)"}`);
  lines.push(`Output contract: ${spec.outputContract || "(not provided)"}`);
  if (spec.guardrails.length) {
    lines.push(`Guardrails (must never do):`);
    spec.guardrails.forEach((g) => lines.push(`- ${g.text}`));
  }
  if (spec.criteria.length) {
    lines.push(`Success criteria (must always satisfy):`);
    spec.criteria.forEach((c) => lines.push(`- ${c.text}`));
  }
  if (spec.examples.length) {
    lines.push(`Worked examples:`);
    spec.examples.forEach((e) => {
      lines.push(`- Input: ${e.input}`);
      if (e.expectedOutput) lines.push(`  Expected output: ${e.expectedOutput}`);
    });
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
          "what you wrote. Bake every guardrail and success criterion into clear, direct instructions. " +
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
          "prompt in production. Deliberately include edge cases and situations implied by the guardrails " +
          "(the kind of input that would tempt the model to violate a guardrail) — don't just repeat the " +
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
}): Promise<string> {
  const content = await chatComplete({
    model: opts.model,
    temperature: opts.temperature,
    messages: [
      { role: "system", content: opts.promptContent },
      { role: "user", content: opts.input },
    ],
  });
  return content.trim();
}

/** Runs the Playground's structured, multi-message template — supports tools and a JSON output schema. */
export async function runPlaygroundWithLLM(opts: {
  messages: ChatMessage[];
  model: string;
  temperature: number;
  tools?: ToolSpec[];
  responseFormat?: ResponseFormatSpec | null;
}): Promise<{ content: string | null; toolCalls?: { name: string; arguments: string }[] }> {
  return chatCompleteRaw({
    model: opts.model,
    temperature: opts.temperature,
    messages: opts.messages,
    tools: opts.tools,
    responseFormat: opts.responseFormat,
  });
}

/**
 * Suggests 1-3 short "what does this power" tags (e.g. "Chatbot Conversation Module") from the
 * Spec's Goal and Output contract — always a suggestion for a human to review, never applied
 * directly, matching how the rest of this app treats AI output as draft-only.
 */
export async function suggestPowerTagsWithLLM(spec: SpecProject): Promise<string[]> {
  const content = await chatComplete({
    model: "gpt-4o-mini",
    temperature: 0.3,
    jsonMode: true,
    messages: [
      {
        role: "system",
        content:
          "You label which product surface or feature a prompt Spec powers, based on its goal and " +
          "output contract. Suggest 1-3 short, concrete tags (2-5 words each, Title Case) that a " +
          "product person would recognize, e.g. 'Chatbot Conversation Module', 'Support Ticket Routing'. " +
          'Respond as JSON: {"tags": ["tag 1", "tag 2"]}.',
      },
      { role: "user", content: specBrief(spec) },
    ],
  });
  try {
    const parsed = JSON.parse(content) as { tags?: unknown };
    if (Array.isArray(parsed.tags)) {
      return parsed.tags.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 3);
    }
  } catch {
    // fall through
  }
  return [];
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
}): Promise<{ passed: boolean; reason: string }> {
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
    const parsed = JSON.parse(content) as { passed?: unknown; reason?: unknown };
    return {
      passed: !!parsed.passed,
      reason: typeof parsed.reason === "string" ? parsed.reason : "Judge did not return a reason.",
    };
  } catch {
    return { passed: false, reason: "Judge response could not be parsed as JSON." };
  }
}

export interface AssistantChatMessage {
  role: "user" | "assistant";
  content: string;
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

/**
 * North Star's live chat turn — grounds `ASSISTANT_SYSTEM_PROMPT` with whichever Spec/tab the user
 * is currently looking at, so guidance (e.g. "tune this rubric") doesn't require re-explaining context.
 */
export async function assistantChat(opts: {
  messages: AssistantChatMessage[];
  spec?: SpecProject | null;
  tab?: string | null;
}): Promise<string> {
  const contextLines: string[] = [];
  if (opts.spec) {
    contextLines.push(`Current Spec brief:\n${specBrief(opts.spec)}`);
    if (opts.tab === "eval" && opts.spec.assertions.length > 0) {
      contextLines.push(`Current assertions:\n${assertionBrief(opts.spec).join("\n")}`);
    }
  } else {
    contextLines.push("No Spec is currently open — the user is browsing lists/library/dashboard.");
  }
  if (opts.tab) contextLines.push(`The user is currently on the "${opts.tab}" tab.`);

  const content = await chatComplete({
    model: "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      { role: "system", content: `${ASSISTANT_SYSTEM_PROMPT}\n\n## Current context\n${contextLines.join("\n\n")}` },
      ...opts.messages.map((m): ChatMessage => ({ role: m.role, content: m.content })),
    ],
  });
  return content.trim();
}
