/**
 * Shared tool-calling contract for North Star's agentic turn. This file has no framework/runtime
 * dependencies (isomorphic) so it can be imported by both the server (`server/openai.ts`, which
 * hands `ASSISTANT_TOOLS` to OpenAI, and `assistantKnowledge.ts`'s offline planner) and the client
 * (`assistantAgentActions.ts`, which executes each call against the app's store). Keeping the
 * schema in one place means the model's contract and the executor's switch statement can't drift.
 */

export type AssistantToolName =
  | "create_spec"
  | "update_spec_fields"
  | "add_spec_items"
  | "generate_artifacts"
  | "run_suite"
  | "publish_spec"
  | "refresh_review_insights"
  | "log_feedback"
  | "navigate";

export interface AssistantToolSpec {
  name: AssistantToolName;
  description: string;
  parameters: Record<string, unknown>;
}

export const ASSISTANT_TOOLS: AssistantToolSpec[] = [
  {
    name: "create_spec",
    description:
      "Create a brand-new Spec (the structured brief a Prompt/Assertions/Dataset get generated from) and open it. Use this whenever the user wants to start building something new. Reasonable defaults are fine — the user can refine everything afterward (including the typed Input/Output contract fields, which this tool doesn't set — that's a Spec-pane task once it exists).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short, human-readable name for the Spec." },
        goal: { type: "string", description: "What this prompt is for, and who reads the output." },
        context: { type: "string", description: "Background beyond the goal — where the output is used downstream, who else is involved." },
        requirements: {
          type: "array",
          items: { type: "string" },
          description: "Flat list of things the output must always or must never do — no guardrail/criteria split, just plain statements.",
        },
        examples: { type: "array", items: { type: "string" }, description: "A couple of sample input strings." },
      },
      required: ["name", "goal"],
    },
  },
  {
    name: "update_spec_fields",
    description: "Patch top-level fields (name/goal/context) on the currently open Spec.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        goal: { type: "string" },
        context: { type: "string" },
      },
    },
  },
  {
    name: "add_spec_items",
    description:
      "Append requirements, worked examples, or open questions to the currently open Spec (additive — never removes existing items).",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["requirement", "example", "open_question"] },
        items: { type: "array", items: { type: "string" }, description: "Plain text, one per requirement/example input/open question." },
      },
      required: ["kind", "items"],
    },
  },
  {
    name: "generate_artifacts",
    description:
      "Generate (or regenerate) the Prompt, Assertions, and/or Dataset from the currently open Spec. Defaults to all three when omitted. This overwrites whichever of those already exist — ask the user to confirm first unless they already asked to (re)generate.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "boolean" },
        assertions: { type: "boolean" },
        dataset: { type: "boolean" },
      },
    },
  },
  {
    name: "run_suite",
    description: "Run the eval suite for the currently open Spec against its Dataset. Requires a Prompt to already be generated.",
    parameters: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["full", "sample"] },
        sampleSize: { type: "number", description: "Only used when scope is 'sample' — how many random rows to run." },
      },
      required: ["scope"],
    },
  },
  {
    name: "publish_spec",
    description:
      "Publish the currently open Spec's Prompt and trigger a fresh full run. Only call this when the user explicitly asks to publish/ship/lock it in, and only once a Prompt has been generated.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "refresh_review_insights",
    description:
      "Get a deeper, AI-generated 'what to review first / how to improve' summary of the currently open Spec's latest Run. Requires at least one run to exist.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "log_feedback",
    description:
      "Capture the user's product feedback about AI Studio itself — praise, confusion, or a bug report — so the team can see it later. Use this whenever the user shares an opinion about the tool instead of just pointing them at the Feedback tab.",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
  },
  {
    name: "navigate",
    description:
      "Switch the Workspace to a different tab for the currently open Spec — use this after generating/running something, so the user lands on the relevant view.",
    parameters: {
      type: "object",
      properties: { tab: { type: "string", enum: ["prompt", "eval", "dataset", "results", "review", "observability"] } },
      required: ["tab"],
    },
  },
];

/** One tool invocation the model (or the offline planner) asked for. */
export interface AssistantToolCall {
  id: string;
  name: string;
  arguments: string;
}

/**
 * One entry in the conversation the client keeps as the source of truth across an agent turn's
 * tool round trips, and re-sends in full on every follow-up request (the server holds no state).
 */
export type AssistantMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: AssistantToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

/** "Where the user is" — mirrors `AssistantView` in `assistantContext.tsx` minus the bits (specId) already implied by sending the full Spec. */
export interface AssistantViewContext {
  section: string | null;
  tab: string | null;
  specName: string | null;
  status: string | null;
}
