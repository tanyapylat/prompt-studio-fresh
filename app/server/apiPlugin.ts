import type { Plugin, Connect } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
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
  suggestPowerTagsHeuristic,
} from "../src/engine";
import { fabricatePlaygroundOffline, substituteVariables } from "../src/promptTemplate";
import { datasetItemSubstitutionValues, datasetItemLabel, datasetVariableNames } from "../src/dataset";
import { newId } from "../src/utils/id";
import { offlineAssistantReply } from "../src/assistantKnowledge";
import {
  assistantChat,
  draftPromptWithLLM,
  generateDatasetWithLLM,
  hasApiKey,
  judgeWithLLM,
  runPlaygroundWithLLM,
  runTargetWithLLM,
  suggestPowerTagsWithLLM,
  type AssistantChatMessage,
  type ChatMessage,
} from "./openai";

const ROLE_TO_API: Record<PromptRole, "system" | "user" | "assistant"> = {
  system: "system",
  human: "user",
  ai: "assistant",
};

const DESIRED_DATASET_SIZE = 8;

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
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
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
    const seedItems = spec.examples.map((e) => ({
      id: newId("item"),
      input: e.input,
      source: "seed" as const,
      expectedOutput: e.expectedOutput,
    }));
    const syntheticCount = Math.max(2, DESIRED_DATASET_SIZE - seedItems.length);
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
      ...seedItems,
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
    if (target.messages && target.messages.length > 0) {
      const values = datasetItemSubstitutionValues(item);
      const messages: ChatMessage[] = target.messages
        .filter((m) => m.content.trim().length > 0)
        .map((m) => ({ role: ROLE_TO_API[m.role], content: substituteVariables(m.content, values) }));
      const result = await runPlaygroundWithLLM({ messages, model: target.model, temperature: target.temperature });
      output = (result.content ?? "").trim();
    } else {
      output = await runTargetWithLLM({
        promptContent: target.promptContent,
        model: target.model,
        temperature: target.temperature,
        input: item.input,
      });
    }

    const inputLabel = datasetItemLabel(item, variableNames);
    const scores = [];
    for (const assertion of spec.assertions) {
      if (assertion.tier === "deterministic" && assertion.check) {
        const { passed, reason } = scoreCodeAssertion(assertion.check, output);
        scores.push({ assertionId: assertion.id, passed, reason });
      } else if (assertion.tier === "custom_code" && assertion.code) {
        const { passed, reason } = scoreCustomCode(assertion.code, assertion.codeLanguage ?? "javascript", output, inputLabel);
        scores.push({ assertionId: assertion.id, passed, reason });
      } else if (assertion.tier === "rubric_grading" && assertion.rubric) {
        const graded = await judgeWithLLM({
          rubric: assertion.rubric,
          input: inputLabel,
          output,
          model: spec.judge?.model || "gpt-4o-mini",
          systemPrompt: spec.judge?.systemPrompt,
          temperature: spec.judge?.temperature,
        });
        scores.push({ assertionId: assertion.id, passed: graded.passed, reason: graded.reason });
      }
    }

    results.push({ datasetItemId: item.id, output, scores });
  }

  return { results, mode: "live" as GenerationMode };
}

interface PlaygroundRunRequest {
  messages: ChatMessage[];
  model: string;
  temperature: number;
  tools?: { name: string; description: string; parameters: unknown }[];
  responseFormat?: { name: string; schema: unknown } | null;
}

/** Ad-hoc Playground tester — a real completion (with tools/schema) when a key is configured, otherwise a deterministic offline fabrication. */
async function handlePlaygroundRun(body: PlaygroundRunRequest) {
  const mode: GenerationMode = hasApiKey() ? "live" : "simulated";
  if (mode === "live") {
    const result = await runPlaygroundWithLLM(body);
    return { ...result, mode };
  }
  const result = fabricatePlaygroundOffline(body);
  return { ...result, mode };
}

interface AssistantChatRequest {
  messages: AssistantChatMessage[];
  spec?: SpecProject | null;
  tab?: string | null;
}

/** North Star's chat turn — falls back to a canned, context-aware tip when no key is configured, same convention as every other endpoint here. */
async function handleAssistantChat(body: AssistantChatRequest) {
  const mode: GenerationMode = hasApiKey() ? "live" : "simulated";
  if (mode === "simulated") {
    return { content: offlineAssistantReply(body.tab ?? undefined), mode };
  }
  const content = await assistantChat({ messages: body.messages ?? [], spec: body.spec ?? null, tab: body.tab ?? null });
  return { content, mode };
}

async function handleSuggestPowers(spec: SpecProject) {
  const mode: GenerationMode = hasApiKey() ? "live" : "simulated";
  let tags: string[] = [];
  if (mode === "live") {
    tags = await suggestPowerTagsWithLLM(spec);
  }
  if (tags.length === 0) {
    tags = suggestPowerTagsHeuristic(spec);
  }
  return { tags, mode };
}

export function apiPlugin(): Plugin {
  return {
    name: "spec-studio-api",
    configureServer(server) {
      const wrap =
        (fn: (spec: SpecProject) => Promise<unknown>): Connect.NextHandleFunction =>
        (req, res) => {
          readJsonBody<{ spec: SpecProject }>(req)
            .then(({ spec }) => fn(spec))
            .then((body) => sendJson(res, 200, body))
            .catch((err: unknown) => {
              const message = err instanceof Error ? err.message : String(err);
              console.error("[spec-studio-api]", message);
              sendJson(res, 502, { error: message });
            });
        };

      server.middlewares.use("/api/health", (_req, res) => {
        sendJson(res, 200, { hasApiKey: hasApiKey() });
      });
      server.middlewares.use("/api/generate", (req, res) => {
        readJsonBody<{ spec: SpecProject; selection: GenerateSelection }>(req)
          .then(({ spec, selection }) =>
            handleGenerate(spec, selection ?? { prompt: true, assertions: true, dataset: true }),
          )
          .then((body) => sendJson(res, 200, body))
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            console.error("[spec-studio-api]", message);
            sendJson(res, 502, { error: message });
          });
      });
      server.middlewares.use("/api/run", (req, res) => {
        readJsonBody<{ spec: SpecProject; itemIds?: string[] }>(req)
          .then(({ spec, itemIds }) => handleRun(spec, itemIds))
          .then((body) => sendJson(res, 200, body))
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            console.error("[spec-studio-api]", message);
            sendJson(res, 502, { error: message });
          });
      });
      server.middlewares.use("/api/suggest-powers", wrap(handleSuggestPowers));
      server.middlewares.use("/api/assistant-chat", (req, res) => {
        readJsonBody<AssistantChatRequest>(req)
          .then(handleAssistantChat)
          .then((body) => sendJson(res, 200, body))
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            console.error("[spec-studio-api]", message);
            sendJson(res, 502, { error: message });
          });
      });
      server.middlewares.use("/api/playground-run", (req, res) => {
        readJsonBody<PlaygroundRunRequest>(req)
          .then(handlePlaygroundRun)
          .then((body) => sendJson(res, 200, body))
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            console.error("[spec-studio-api]", message);
            sendJson(res, 502, { error: message });
          });
      });
    },
  };
}
