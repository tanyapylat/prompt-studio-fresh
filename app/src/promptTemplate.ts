import type { PromptMessage, PromptOutputSchema, PromptTool } from "./types";
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

// `{{`/`}}` are treated as escaped literal braces (Python str.format() convention), so a JSON
// example embedded in a prompt (e.g. `Respond as {{"status": "ok"}}`) doesn't get misdetected as a
// `{variable}` — only a single-brace, identifier-shaped token counts.
const ESCAPED_OPEN = "\u0000";
const ESCAPED_CLOSE = "\u0001";
const VARIABLE_PATTERN = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

function escapeLiteralBraces(text: string): string {
  return text.replace(/\{\{/g, ESCAPED_OPEN).replace(/\}\}/g, ESCAPED_CLOSE);
}

function unescapeLiteralBraces(text: string): string {
  return text.split(ESCAPED_OPEN).join("{").split(ESCAPED_CLOSE).join("}");
}

/** Every `{name}` placeholder across all messages, in first-appearance order, de-duplicated. */
export function extractVariableNames(messages: PromptMessage[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const message of messages) {
    const escaped = escapeLiteralBraces(message.content);
    for (const match of escaped.matchAll(VARIABLE_PATTERN)) {
      const name = match[1];
      if (!seen.has(name)) {
        seen.add(name);
        ordered.push(name);
      }
    }
  }
  return ordered;
}

/** Fills `{name}` placeholders from `values` (missing entries become empty string) and restores literal braces. */
export function substituteVariables(content: string, values: Record<string, string>): string {
  const escaped = escapeLiteralBraces(content);
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
