import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { applyCors } from "./cors";
import type {
  Assertion,
  GenerateSelection,
  GenerationMode,
  PromptRole,
  RunItemResult,
  SpecProject,
  TargetVersion,
} from "../src/types";
import {
  DEFAULT_TARGET_MODEL,
  DEFAULT_TEMPERATURE,
  buildPromptContent,
  classifyAssertionsFor,
  generateSyntheticItems,
  runSuiteOffline,
  scoreCodeAssertion,
  scoreCustomCode,
  suggestRunInsightsHeuristic,
} from "../src/engine";
import { fabricatePlaygroundOffline, substituteVariables } from "../src/promptTemplate";
import { datasetItemSubstitutionValues, datasetItemLabel, datasetVariableNames } from "../src/dataset";
import { estimateCostUsd, estimateTokens } from "../src/pricing";
import { newId } from "../src/utils/id";
import { offlineAgentTurn } from "../src/assistantKnowledge";
import type { AssistantMessage, AssistantViewContext } from "../src/assistantTools";
import {
  assistantAgentTurn,
  draftPromptWithLLM,
  generateDatasetWithLLM,
  hasApiKey,
  judgeWithLLM,
  runPlaygroundWithLLM,
  runTargetWithLLM,
  specBrief,
  suggestReviewInsightsWithLLM,
  type CompletionSettings,
} from "./openai";

const ROLE_TO_API: Record<PromptRole, "system" | "user" | "assistant"> = {
  system: "system",
  human: "user",
  ai: "assistant",
};

const DESIRED_DATASET_SIZE = 8;

/** `TargetVersion.settings.logitBias` is authored as raw JSON text — parsed defensively here. */
function parseLogitBias(raw: string | undefined): Record<string, number> | undefined {
  if (!raw || !raw.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, number>;
    }
  } catch {
    // Invalid JSON — the Playground already blocks Run in this state, so just drop it.
  }
  return undefined;
}

function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(raw ? (JSON.parse(raw) as T) : ({} as T));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  applyCors(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function requestPath(req: IncomingMessage): string {
  return (req.url ?? "").split("?")[0] ?? "";
}

export async function handleApiRoute(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = requestPath(req);
  if (!url.startsWith("/api/")) return false;

  if (req.method === "OPTIONS") {
    applyCors(res);
    res.statusCode = 204;
    res.end();
    return true;
  }

  if (url === "/api/health" || url === "/api/health/") {
    sendJson(res, 200, { hasApiKey: hasApiKey() });
    return true;
  }

  try {
    if (url === "/api/generate" || url === "/api/generate/") {
      const { spec, selection } = await readJsonBody<{ spec: SpecProject; selection: GenerateSelection }>(req);
      sendJson(res, 200, await handleGenerate(spec, selection ?? { prompt: true, assertions: true, dataset: true }));
      return true;
    }
    if (url === "/api/run" || url === "/api/run/") {
      const { spec, itemIds } = await readJsonBody<{ spec: SpecProject; itemIds?: string[] }>(req);
      sendJson(res, 200, await handleRun(spec, itemIds));
      return true;
    }
    if (url === "/api/suggest-review-insights" || url === "/api/suggest-review-insights/") {
      const { spec, runId } = await readJsonBody<{ spec: SpecProject; runId: string }>(req);
      sendJson(res, 200, await handleSuggestReviewInsights(spec, runId));
      return true;
    }
    if (url === "/api/assistant-chat" || url === "/api/assistant-chat/") {
      sendJson(res, 200, await handleAssistantChat(await readJsonBody<AssistantChatRequest>(req)));
      return true;
    }
    if (url === "/api/playground-run" || url === "/api/playground-run/") {
      sendJson(res, 200, await handlePlaygroundRun(await readJsonBody<PlaygroundRunRequest>(req)));
      return true;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[spec-studio-api]", message);
    sendJson(res, 502, { error: message });
    return true;
  }

  return false;
}

function attachApi(middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void }) {
  middlewares.use((req, res, next) => {
    applyCors(res);
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    void handleApiRoute(req, res)
      .then((handled) => {
        if (!handled) next();
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[spec-studio-api]", message);
        sendJson(res, 502, { error: message });
      });
  });
}

async function handleGenerate(spec: SpecProject, selection: GenerateSelection) {
  const model = spec.target?.model || DEFAULT_TARGET_MODEL;
  const temperature = spec.target?.temperature ?? DEFAULT_TEMPERATURE;
  const mode: GenerationMode = hasApiKey() ? "live" : "simulated";
  const response: {
    target?: TargetVersion;
    assertions?: Assertion[];
    judge?: { id: string; model: string } | null;
    dataset?: ReturnType<typeof generateSyntheticItems>;
    mode: GenerationMode;
  } = { mode };

  if (selection.prompt) {
    const promptContent = mode === "live"
      ? await draftPromptWithLLM(spec, model)
      : buildPromptContent(spec);
    response.target = {
      id: spec.target?.id ?? newId("target"),
      promptContent,
      model,
      temperature,
      status: "draft",
    };
  }

  if (selection.assertions) {
    const assertions = classifyAssertionsFor(spec);
    const needsJudge = assertions.some((a) => a.tier === "rubric_grading");
    response.assertions = assertions;
    response.judge = needsJudge ? { id: newId("judge"), model: "gpt-4o-mini" } : null;
  }

  if (selection.dataset) {
    const manualItems = spec.examples.map((e) => ({
      id: newId("item"),
      input: e.input,
      source: "manual" as const,
      expectedOutput: e.expectedOutput,
    }));
    const syntheticCount = Math.max(2, DESIRED_DATASET_SIZE - manualItems.length);
    let syntheticInputs: string[];

    if (mode === "live") {
      syntheticInputs = await generateDatasetWithLLM(spec, syntheticCount);
      if (syntheticInputs.length === 0) {
        syntheticInputs = generateSyntheticItems(spec, syntheticCount).map((i) => i.input);
      }
    } else {
      syntheticInputs = generateSyntheticItems(spec, syntheticCount).map((i) => i.input);
    }
    response.dataset = [
      ...manualItems,
      ...syntheticInputs.map((input) => ({ id: newId("item"), input, source: "synthetic" as const })),
    ];
  }

  return response;
}

async function handleRun(spec: SpecProject, itemIds?: string[]) {
  if (!spec.target) throw new Error("Cannot run without a generated Target");

  if (!hasApiKey()) {
    const rg = runSuiteOffline(spec, itemIds);
    return { results: rg.results, mode: "simulated" as GenerationMode };
  }

  const target = spec.target;
  const items = itemIds && itemIds.length > 0 ? spec.dataset.filter((d) => itemIds.includes(d.id)) : spec.dataset;
  const variableNames = datasetVariableNames(target.messages);
  const results: RunItemResult[] = [];

  for (const item of items) {
    let output: string;

    // Targets with a structured template (edited via the Playground) run their exact multi-message,
    // multi-variable template; legacy Targets (system prompt + single `{input}`) keep the original
    // simple shape so nothing changes for Specs that never touched the Playground.
    const settings: CompletionSettings | undefined = target.settings
      ? {
          maxTokens: target.settings.maxTokens,
          topP: target.settings.topP,
          frequencyPenalty: target.settings.frequencyPenalty,
          presencePenalty: target.settings.presencePenalty,
          seed: target.settings.seed,
          stopSequences: target.settings.stopSequences,
          logitBias: parseLogitBias(target.settings.logitBias),
          timeoutMs: target.settings.timeoutMs,
        }
      : undefined;

    // Timed and priced around just the generation call — not the judge grading call below — since
    // that's the cost/latency a production caller of this Target would actually incur.
    const startedAt = Date.now();
    let usage: { promptTokens: number; completionTokens: number };

    if (target.messages && target.messages.length > 0) {
      const values = datasetItemSubstitutionValues(item);
      const messages: { role: "system" | "user" | "assistant"; content: string }[] = target.messages
        .filter((m) => m.content.trim().length > 0)
        .map((m) => ({ role: ROLE_TO_API[m.role], content: substituteVariables(m.content, values) }));
      const result = await runPlaygroundWithLLM({ messages, model: target.model, temperature: target.temperature, settings });
      output = (result.content ?? "").trim();
      usage = result.usage;
    } else {
      const result = await runTargetWithLLM({
        promptContent: target.promptContent,
        model: target.model,
        temperature: target.temperature,
        input: item.input,
        settings,
      });
      output = result.content;
      usage = result.usage;
    }

    const latencyMs = Date.now() - startedAt;
    const costUsd = estimateCostUsd(target.model, usage.promptTokens, usage.completionTokens);

    const inputLabel = datasetItemLabel(item, variableNames);
    const scores = [];
    for (const assertion of spec.assertions) {
      if (assertion.tier === "deterministic" && assertion.check) {
        const { passed, reason } = scoreCodeAssertion(assertion.check, output);
        scores.push({ assertionId: assertion.id, passed, reason, score: passed ? 1 : 0 });
      } else if (assertion.tier === "custom_code" && assertion.code) {
        const { passed, reason } = scoreCustomCode(assertion.code, assertion.codeLanguage ?? "javascript", output, inputLabel);
        scores.push({ assertionId: assertion.id, passed, reason, score: passed ? 1 : 0 });
      } else if (assertion.tier === "rubric_grading" && assertion.rubric) {
        const graded = await judgeWithLLM({
          rubric: assertion.rubric,
          input: inputLabel,
          output,
          model: spec.judge?.model || "gpt-4o-mini",
          systemPrompt: spec.judge?.systemPrompt,
          temperature: spec.judge?.temperature,
        });
        scores.push({
          assertionId: assertion.id,
          passed: graded.passed,
          reason: graded.reason,
          score: graded.score ?? (graded.passed ? 1 : 0),
        });
      }
    }

    const tokenUsage = { promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, totalTokens: usage.promptTokens + usage.completionTokens };
    results.push({ datasetItemId: item.id, output, scores, latencyMs, costUsd, tokenUsage });
  }

  return { results, mode: "live" as GenerationMode };
}

interface PlaygroundRunRequest {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  model: string;
  temperature: number;
  tools?: { name: string; description: string; parameters: unknown }[];
  responseFormat?: { name: string; schema: unknown } | null;
  settings?: CompletionSettings;
}

/**
 * Ad-hoc Playground tester — a real completion (with tools/schema) when a key is configured,
 * otherwise a deterministic offline fabrication. Either way, every run reports usage/cost/latency
 * so "Try it" always shows what a real call would have cost — estimated (by character count) in
 * simulated mode, exact (from the API's own `usage` block) in live mode.
 */
async function handlePlaygroundRun(body: PlaygroundRunRequest) {
  const mode: GenerationMode = hasApiKey() ? "live" : "simulated";
  const startedAt = Date.now();

  if (mode === "live") {
    const result = await runPlaygroundWithLLM(body);
    const latencyMs = Date.now() - startedAt;
    const costUsd = estimateCostUsd(body.model, result.usage.promptTokens, result.usage.completionTokens);
    return { content: result.content, toolCalls: result.toolCalls, mode, usage: result.usage, latencyMs, costUsd };
  }

  const result = fabricatePlaygroundOffline(body);
  const latencyMs = Date.now() - startedAt;
  const promptTokens = body.messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const completionTokens = estimateTokens(result.content ?? JSON.stringify(result.toolCalls ?? ""));
  const usage = { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
  const costUsd = estimateCostUsd(body.model, promptTokens, completionTokens);
  return { ...result, mode, usage, latencyMs, costUsd };
}

interface AssistantChatRequest {
  messages: AssistantMessage[];
  spec?: SpecProject | null;
  view?: AssistantViewContext | null;
}

/**
 * North Star's agentic turn — one OpenAI call (or one scripted planner call in simulated mode) per
 * request; the client owns the conversation and executes any returned `toolCalls` itself, then
 * calls this again with the tool results appended to continue the same turn. Falls back to the
 * deterministic `offlineAgentTurn` "dummy flow" when no key is configured, same live/simulated
 * convention as every other endpoint here.
 */
async function handleAssistantChat(body: AssistantChatRequest) {
  const mode: GenerationMode = hasApiKey() ? "live" : "simulated";
  if (mode === "simulated") {
    const { content, toolCalls } = offlineAgentTurn({
      messages: body.messages ?? [],
      spec: body.spec ?? null,
      tab: body.view?.tab ?? null,
    });
    return { content, toolCalls, mode };
  }
  const { content, toolCalls } = await assistantAgentTurn({
    messages: body.messages ?? [],
    spec: body.spec ?? null,
    view: body.view ?? null,
  });
  return { content, toolCalls, mode };
}

/**
 * Deeper, opt-in "what to review first / how to improve" for a finished Run. Simulated mode (no
 * key) always uses the free heuristic; live mode tries the LLM pass and falls back to the same
 * heuristic if the model returned nothing usable.
 */
async function handleSuggestReviewInsights(spec: SpecProject, runId: string) {
  const run = spec.runs.find((r) => r.id === runId);
  if (!run) throw new Error(`Run "${runId}" not found on this spec`);

  const mode: GenerationMode = hasApiKey() ? "live" : "simulated";
  if (mode === "simulated") {
    return { insights: suggestRunInsightsHeuristic(spec, run), mode };
  }

  const variableNames = datasetVariableNames(spec.target?.messages);
  const byItem = new Map(spec.dataset.map((d) => [d.id, d]));
  const assertionById = new Map(spec.assertions.map((a) => [a.id, a]));

  const failing = run.results
    .map((r) => ({ result: r, failed: r.scores.filter((s) => !s.passed) }))
    .filter((r) => r.failed.length > 0)
    .sort((a, b) => b.failed.length - a.failed.length)
    .slice(0, 20);

  const rowLines = failing.map(({ result, failed }) => {
    const item = byItem.get(result.datasetItemId);
    const label = item ? datasetItemLabel(item, variableNames) : result.datasetItemId;
    const failDesc = failed
      .map((s) => `${assertionById.get(s.assertionId)?.description ?? "check"} (${s.reason})`)
      .join("; ");
    return `- id="${result.datasetItemId}" input="${label.slice(0, 100)}" failed ${failed.length}/${result.scores.length}: ${failDesc.slice(0, 300)}`;
  });

  const assertionLines = spec.assertions.map((a) => {
    const scores = run.results.flatMap((r) => r.scores.filter((s) => s.assertionId === a.id));
    const failCount = scores.filter((s) => !s.passed).length;
    return `- "${a.description}" [${a.tier}]: ${failCount}/${scores.length} failed`;
  });

  const resultsBrief = [
    `Run: ${run.results.length} rows, ${Math.round(run.passRate * 100)}% overall pass rate.`,
    `Assertion fail rates:\n${assertionLines.join("\n")}`,
    rowLines.length > 0 ? `Failing rows (worst first):\n${rowLines.join("\n")}` : "No failing rows.",
  ].join("\n\n");

  const insights = await suggestReviewInsightsWithLLM({
    specBrief: specBrief(spec),
    resultsBrief,
    validItemIds: run.results.map((r) => r.datasetItemId),
  });

  if (insights.reviewFirst.length === 0 && insights.improvements.length === 0) {
    return { insights: suggestRunInsightsHeuristic(spec, run), mode };
  }
  return { insights, mode };
}

export function apiPlugin(): Plugin {
  return {
    name: "spec-studio-api",
    configureServer(server) {
      attachApi(server.middlewares);
    },
    configurePreviewServer(server) {
      attachApi(server.middlewares);
    },
  };
}
