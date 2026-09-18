import type { SpecProject } from "./types";
import { createBlankSpec, generateFromSpec, newExample, newOpenQuestion, newRequirement, rerun } from "./specFactory";
import { publishSpec } from "./lifecycle";
import { suggestReviewInsightsRemote } from "./api";
import { pickRandomIds } from "./dataset";
import { logFeedback } from "./feedbackStore";
import type { AssistantToolName } from "./assistantTools";

/**
 * Everything `runAssistantTool` needs to actually perform an action — bundles the pieces
 * `AssistantChat.tsx` already has from `useStore()`/`useAssistantView()`. `setSpec`/`addSpec`
 * both persist to the store AND update the caller's local `workingSpec` variable (see
 * `AssistantChat.tsx`), since a batch of tool calls within one turn can't rely on `useStore()`
 * re-rendering between them.
 */
export interface AssistantAgentContext {
  spec: SpecProject | null;
  ownerId: string;
  currentUserName: string;
  view: { specName: string | null; tab: string | null; section: string | null };
  signal?: AbortSignal;
  addSpec: (spec: SpecProject) => void;
  setSpec: (spec: SpecProject) => void;
  requestNavigate: (tab: string) => void;
}

export interface AssistantToolResult {
  ok: boolean;
  /** Sent back to the model as the tool result content, and shown in the chat's action card. */
  summary: string;
}

const DEFAULT_SAMPLE_SIZE = 5;

function parseArgs<T>(argumentsJson: string): T {
  try {
    return JSON.parse(argumentsJson || "{}") as T;
  } catch {
    return {} as T;
  }
}

function noSpecError(): AssistantToolResult {
  return { ok: false, summary: "No Spec is open yet — create one first." };
}

/** Executes one tool call against the real app state. Never throws — failures come back as `{ ok: false }` so the caller can narrate them. */
export async function runAssistantTool(
  name: string,
  argumentsJson: string,
  ctx: AssistantAgentContext,
): Promise<AssistantToolResult> {
  try {
    switch (name as AssistantToolName) {
      case "create_spec": {
        const args = parseArgs<{
          name: string;
          goal: string;
          context?: string;
          requirements?: string[];
          examples?: string[];
        }>(argumentsJson);
        const spec: SpecProject = {
          ...createBlankSpec(args.name?.trim() || "New Spec", ctx.ownerId),
          goal: args.goal ?? "",
          context: args.context ?? "",
          requirements: (args.requirements ?? []).filter(Boolean).map((t) => newRequirement(t)),
          examples: (args.examples ?? []).filter(Boolean).map((t) => newExample(t)),
        };
        ctx.addSpec(spec);
        return { ok: true, summary: `Created Spec "${spec.name}" and opened it.` };
      }

      case "update_spec_fields": {
        if (!ctx.spec) return noSpecError();
        const args = parseArgs<{ name?: string; goal?: string; context?: string }>(argumentsJson);
        const updated: SpecProject = {
          ...ctx.spec,
          ...(args.name !== undefined ? { name: args.name } : {}),
          ...(args.goal !== undefined ? { goal: args.goal } : {}),
          ...(args.context !== undefined ? { context: args.context } : {}),
          updatedAt: Date.now(),
        };
        ctx.setSpec(updated);
        return { ok: true, summary: "Updated the Spec's brief." };
      }

      case "add_spec_items": {
        if (!ctx.spec) return noSpecError();
        const args = parseArgs<{ kind: "requirement" | "example" | "open_question"; items: string[] }>(argumentsJson);
        const items = (args.items ?? []).filter((t) => t && t.trim().length > 0);
        if (items.length === 0) return { ok: false, summary: "No items provided." };
        let updated = ctx.spec;
        if (args.kind === "requirement") {
          updated = { ...updated, requirements: [...updated.requirements, ...items.map((t) => newRequirement(t))] };
        } else if (args.kind === "open_question") {
          updated = { ...updated, openQuestions: [...updated.openQuestions, ...items.map((t) => newOpenQuestion(t))] };
        } else {
          updated = { ...updated, examples: [...updated.examples, ...items.map((t) => newExample(t))] };
        }
        updated = { ...updated, updatedAt: Date.now() };
        ctx.setSpec(updated);
        return { ok: true, summary: `Added ${items.length} ${args.kind}(s) to the Spec.` };
      }

      case "generate_artifacts": {
        if (!ctx.spec) return noSpecError();
        const args = parseArgs<{ prompt?: boolean; assertions?: boolean; dataset?: boolean }>(argumentsJson);
        const selection = {
          prompt: args.prompt ?? true,
          assertions: args.assertions ?? true,
          dataset: args.dataset ?? true,
        };
        const updated = await generateFromSpec(ctx.spec, selection, ctx.signal);
        ctx.setSpec(updated);
        const parts: string[] = [];
        if (selection.prompt) parts.push("a Prompt draft");
        if (selection.assertions) parts.push(`${updated.assertions.length} assertion(s)`);
        if (selection.dataset) parts.push(`${updated.dataset.length} dataset row(s)`);
        return { ok: true, summary: `Generated ${parts.join(", ")}.` };
      }

      case "run_suite": {
        if (!ctx.spec) return noSpecError();
        if (!ctx.spec.target) return { ok: false, summary: "There's no Prompt to run yet — generate one first." };
        const args = parseArgs<{ scope?: "full" | "sample"; sampleSize?: number }>(argumentsJson);
        const itemIds =
          args.scope === "sample"
            ? pickRandomIds(ctx.spec.dataset.map((d) => d.id), args.sampleSize ?? DEFAULT_SAMPLE_SIZE)
            : undefined;
        const updated = await rerun(ctx.spec, itemIds, ctx.signal, ctx.ownerId);
        ctx.setSpec(updated);
        const run = updated.runs[updated.runs.length - 1];
        return { ok: true, summary: `Ran the suite (${run.results.length} row(s)) — ${Math.round(run.passRate * 100)}% pass rate.` };
      }

      case "publish_spec": {
        if (!ctx.spec) return noSpecError();
        if (!ctx.spec.target) return { ok: false, summary: "There's no Prompt to publish yet — generate one first." };
        const updated = await publishSpec(ctx.spec, ctx.signal, ctx.ownerId);
        ctx.setSpec(updated);
        const run = updated.runs[updated.runs.length - 1];
        return {
          ok: true,
          summary: `Published the Prompt and ran the suite${run ? ` — ${Math.round(run.passRate * 100)}% pass rate.` : "."}`,
        };
      }

      case "refresh_review_insights": {
        if (!ctx.spec) return noSpecError();
        const lastRun = ctx.spec.runs[ctx.spec.runs.length - 1];
        if (!lastRun) return { ok: false, summary: "There's no run yet to review." };
        const { insights } = await suggestReviewInsightsRemote(ctx.spec, lastRun.id);
        if (insights.reviewFirst.length === 0 && insights.improvements.length === 0) {
          return { ok: true, summary: "Nothing stands out — every row passed every check." };
        }
        const lines = [
          ...insights.reviewFirst.slice(0, 3).map((r) => `Review: ${r.reason}`),
          ...insights.improvements.slice(0, 3).map((i) => `Improve: ${i}`),
        ];
        return { ok: true, summary: lines.join(" | ") };
      }

      case "log_feedback": {
        const args = parseArgs<{ text: string }>(argumentsJson);
        const text = (args.text ?? "").trim();
        if (!text) return { ok: false, summary: "No feedback text provided." };
        const contextParts: string[] = [];
        if (ctx.view.specName) contextParts.push(`Spec "${ctx.view.specName}"`);
        if (ctx.view.tab) contextParts.push(`${ctx.view.tab} tab`);
        if (ctx.view.section && !ctx.view.specName) contextParts.push(`${ctx.view.section} section`);
        logFeedback(text, contextParts.length > 0 ? contextParts.join(" / ") : "North Star chat", ctx.currentUserName);
        return { ok: true, summary: "Logged as product feedback — thank you." };
      }

      case "navigate": {
        const args = parseArgs<{ tab?: string }>(argumentsJson);
        if (!ctx.spec || !args.tab) return { ok: false, summary: "Nothing to navigate to." };
        ctx.requestNavigate(args.tab);
        return { ok: true, summary: `Switched to the ${args.tab} tab.` };
      }

      default:
        return { ok: false, summary: `Unknown tool "${name}".` };
    }
  } catch (e) {
    return { ok: false, summary: e instanceof Error ? e.message : String(e) };
  }
}
