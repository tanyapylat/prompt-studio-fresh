import type { PromptMessage, PromptOutputSchema, PromptRole, PromptSettings, PromptTool } from "./types";
import { newId } from "./utils/id";

/** Shared starting point for a new Tool's parameters or a new Output Schema — a minimal, valid JSON Schema object. */
const JSON_SCHEMA_SKELETON = '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}';

/**
 * Every existing/legacy prompt (just a system string) opens with a ready-made Human message and
 * `{input}` variable, so the new Playground still supports the old "one input box" workflow without
 * any manual setup.
 */
export function defaultMessages(promptContent: string): PromptMessage[] {
  return [
    { id: newId("msg"), role: "system", content: promptContent },
    { id: newId("msg"), role: "human", content: "{input}" },
  ];
}

export function defaultOutputSchema(): PromptOutputSchema {
  return { enabled: false, name: "output", schema: JSON_SCHEMA_SKELETON };
}

export function emptyTool(): PromptTool {
  return { id: newId("tool"), name: "", description: "", parameters: JSON_SCHEMA_SKELETON };
}

/** Every field left undefined means "use the provider default" — this is an empty config, not a zeroed one. */
export function defaultPromptSettings(): PromptSettings {
  return {};
}

/**
 * The Eval Suite only ever reads a flattened system-prompt string (`TargetVersion.promptContent`),
 * so every save re-derives it from the structured messages — keeping that mental model accurate
 * even though the richer template now lives alongside it.
 */
export function flattenSystemContent(messages: PromptMessage[]): string {
  return messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
}

export const ROLE_TO_API: Record<PromptRole, "system" | "user" | "assistant"> = {
  system: "system",
  human: "user",
  ai: "assistant",
};

const ROLE_HEADING: Record<PromptRole, string> = { system: "SYSTEM", human: "HUMAN", ai: "AI" };

/** Everything the structured editor holds, i.e. one Prompt version (or the working draft of one). */
export interface PromptTemplateSource {
  messages: PromptMessage[];
  model: string;
  temperature: number;
  tools: PromptTool[];
  outputSchema: PromptOutputSchema;
  settings: PromptSettings;
}

/**
 * The whole template as one role-labelled plain-text block — the "just show me the prompt" view,
 * for reading a long prompt end to end, diffing it elsewhere, or pasting it somewhere else.
 */
export function promptAsPlainText(messages: PromptMessage[]): string {
  return messages.map((m) => `### ${ROLE_HEADING[m.role]}\n${m.content}`).join("\n\n");
}

/** Tool/schema JSON is authored as free text, so anything unparseable is shown verbatim rather than dropped. */
function parsedOrVerbatim(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * The chat-completions request body this template produces, mirroring what `server/openai.ts`
 * actually sends — the raw code behind the structured editor, for reviewing exactly what goes to
 * the provider or lifting it into an SDK call.
 */
export function promptAsRequestJson(source: PromptTemplateSource): string {
  const s = source.settings;
  const body: Record<string, unknown> = {
    model: source.model,
    temperature: source.temperature,
    messages: source.messages.map((m) => ({ role: ROLE_TO_API[m.role], content: m.content })),
  };

  if (source.outputSchema.enabled) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: source.outputSchema.name || "output",
        schema: parsedOrVerbatim(source.outputSchema.schema),
        strict: true,
      },
    };
  }

  const tools = source.tools.filter((t) => t.name.trim());
  if (tools.length > 0) {
    body.tools = tools.map((t) => ({
      type: "function",
      function: { name: t.name.trim(), description: t.description, parameters: parsedOrVerbatim(t.parameters) },
    }));
  }

  if (s.maxTokens !== undefined) body.max_completion_tokens = s.maxTokens;
  if (s.topP !== undefined) body.top_p = s.topP;
  if (s.frequencyPenalty !== undefined) body.frequency_penalty = s.frequencyPenalty;
  if (s.presencePenalty !== undefined) body.presence_penalty = s.presencePenalty;
  if (s.seed !== undefined) body.seed = s.seed;
  if (s.stopSequences && s.stopSequences.length > 0) body.stop = s.stopSequences;
  if (s.logitBias?.trim()) body.logit_bias = parsedOrVerbatim(s.logitBias);

  return JSON.stringify(body, null, 2);
}

// `{{`/`}}` are treated as escaped literal braces (Python str.format() convention), so a JSON
// example embedded in a prompt (e.g. `Respond as {{"status": "ok"}}`) doesn't get misdetected as a
// `{variable}` — only a single-brace, identifier-shaped token counts.
//
// EXCEPTION: `{{identifier}}` (Handlebars-style, no punctuation inside) is also treated as a
// variable — real-world prompts (and reverse-engineered production configs) very commonly use this
// convention instead of AI Studio's native single-brace one. A literal double-brace JSON example
// like `{{"status": "ok"}}` still isn't a bare identifier, so it safely falls through to the
// existing escaped-literal-brace handling below — the two conventions don't collide.
const ESCAPED_OPEN = "\u0000";
const ESCAPED_CLOSE = "\u0001";
const DOUBLE_VARIABLE_PATTERN = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g;
const VARIABLE_PATTERN = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

function escapeLiteralBraces(text: string): string {
  return text.replace(/\{\{/g, ESCAPED_OPEN).replace(/\}\}/g, ESCAPED_CLOSE);
}

function unescapeLiteralBraces(text: string): string {
  return text.split(ESCAPED_OPEN).join("{").split(ESCAPED_CLOSE).join("}");
}

/** Every `{name}` or `{{name}}` placeholder across all messages, in first-appearance order, de-duplicated. */
export function extractVariableNames(messages: PromptMessage[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const record = (name: string) => {
    if (!seen.has(name)) {
      seen.add(name);
      ordered.push(name);
    }
  };
  for (const message of messages) {
    for (const match of message.content.matchAll(DOUBLE_VARIABLE_PATTERN)) {
      record(match[1]);
    }
    const escaped = escapeLiteralBraces(message.content);
    for (const match of escaped.matchAll(VARIABLE_PATTERN)) {
      record(match[1]);
    }
  }
  return ordered;
}

/** Fills `{name}`/`{{name}}` placeholders from `values` (missing entries become empty string) and restores literal braces. */
export function substituteVariables(content: string, values: Record<string, string>): string {
  const withDoubles = content.replace(DOUBLE_VARIABLE_PATTERN, (_match, name: string) => values[name] ?? "");
  const escaped = escapeLiteralBraces(withDoubles);
  const substituted = escaped.replace(VARIABLE_PATTERN, (_match, name: string) => values[name] ?? "");
  return unescapeLiteralBraces(substituted);
}

/** Best-effort example value for one JSON Schema node — used to fabricate offline tool args/output. */
function fabricateFromJsonSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return null;
  const node = schema as Record<string, unknown>;

  if (Array.isArray(node.enum) && node.enum.length > 0) return node.enum[0];
  if (node.example !== undefined) return node.example;

  switch (node.type) {
    case "object": {
      const properties = (node.properties ?? {}) as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const [key, propertySchema] of Object.entries(properties)) {
        result[key] = fabricateFromJsonSchema(propertySchema);
      }
      return result;
    }
    case "array":
      return node.items ? [fabricateFromJsonSchema(node.items)] : [];
    case "string":
      return "example";
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    default:
      return null;
  }
}

export interface PlaygroundOfflineRequest {
  messages: { role: string; content: string }[];
  model: string;
  temperature: number;
  tools?: { name: string; description: string; parameters: unknown }[];
  responseFormat?: { name: string; schema: unknown } | null;
}

export interface PlaygroundOfflineResponse {
  content: string | null;
  toolCalls?: { name: string; arguments: string }[];
}

/**
 * Deterministic stand-in for a live call when no OPENAI_API_KEY is configured — same spirit as
 * `engine.ts`'s offline Eval simulation, but for the ad-hoc Playground tester. Tools take priority
 * (fabricates a call to the first one), then a schema-shaped object, then a plain text echo.
 */
export function fabricatePlaygroundOffline(opts: PlaygroundOfflineRequest): PlaygroundOfflineResponse {
  if (opts.tools && opts.tools.length > 0) {
    const tool = opts.tools[0];
    const args = fabricateFromJsonSchema(tool.parameters);
    return { content: null, toolCalls: [{ name: tool.name, arguments: JSON.stringify(args) }] };
  }

  if (opts.responseFormat) {
    const fabricated = fabricateFromJsonSchema(opts.responseFormat.schema);
    return { content: JSON.stringify(fabricated, null, 2) };
  }

  const lastHuman = [...opts.messages].reverse().find((m) => m.role === "user");
  const preview = lastHuman?.content?.slice(0, 160) || "(no human message)";
  return {
    content: `[Simulated response — no OPENAI_API_KEY configured] Using ${opts.model} (temp ${opts.temperature}) across ${opts.messages.length} message(s), the prompt would respond to: "${preview}"`,
  };
}
