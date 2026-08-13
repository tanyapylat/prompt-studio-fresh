import type {
  Assertion,
  AssertionTier,
  Criterion,
  Example,
  GenerateSelection,
  LibraryVisibility,
  PowerTag,
  SpecProject,
  TargetVersion,
} from "./types";
import { newId } from "./utils/id";
import { finalizeRun } from "./engine";
import { generateBundleRemote, runSuiteRemote, suggestPowersRemote } from "./api";
import type { PromptVersionPatch } from "./promptFactory";

export function createBlankSpec(
  name: string,
  ownerId: string,
  visibility: LibraryVisibility = "private",
): SpecProject {
  const now = Date.now();
  return {
    id: newId("spec"),
    name,
    status: "draft",
    goal: "",
    inputContract: "",
    outputContract: "",
    guardrails: [],
    criteria: [],
    examples: [],
    target: null,
    promptHistory: [],
    assertions: [],
    judge: null,
    dataset: [],
    datasetStatus: "draft",
    defaultPassThreshold: 1,
    evalStatus: "draft",
    runs: [],
    comments: [],
    verdict: "pending",
    released: false,
    ownerId,
    visibility,
    access: [],
    powers: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Fork an existing Spec into a fresh draft "new version": copies content, remints ids, clears
 * runs/review state so the author starts clean while keeping provenance via forkedFrom*.
 */
export function forkSpec(source: SpecProject, ownerId: string, name?: string): SpecProject {
  const now = Date.now();
  const critMap = new Map<string, string>();

  function remintCriteria(list: Criterion[]): Criterion[] {
    return list.map((c) => {
      const id = newId("crit");
      critMap.set(c.id, id);
      return { ...c, id };
    });
  }

  const guardrails = remintCriteria(source.guardrails);
  const criteria = remintCriteria(source.criteria);

  return {
    ...source,
    id: newId("spec"),
    name: name?.trim() || `${source.name} (new version)`,
    status: "draft",
    guardrails,
    criteria,
    examples: source.examples.map((e) => ({ ...e, id: newId("ex") })),
    target: source.target
      ? { ...source.target, id: newId("target"), status: "draft", createdAt: now, copiedFromPromptId: undefined }
      : null,
    promptHistory: [],
    assertions: source.assertions.map((a) => ({
      ...a,
      id: newId("assert"),
      status: "draft" as const,
      sourceCriterionId: a.sourceCriterionId ? (critMap.get(a.sourceCriterionId) ?? null) : null,
      check: a.check ? { ...a.check } : undefined,
    })),
    judge: source.judge ? { ...source.judge, id: newId("judge"), libraryOrigin: undefined } : null,
    dataset: source.dataset.map((d) => ({ ...d, id: newId("item") })),
    datasetStatus: "draft",
    evalStatus: "draft",
    datasetLibraryOrigin: undefined,
    runs: [],
    comments: [],
    verdict: "pending",
    released: false,
    lastGenerationMode: undefined,
    ownerId,
    visibility: "private",
    access: [],
    powers: source.powers.map((p) => ({ ...p, id: newId("power") })),
    forkedFromId: source.id,
    forkedFromName: source.name,
    createdAt: now,
    updatedAt: now,
  };
}

export function newCriterion(text: string, kind: Criterion["kind"] = "criterion"): Criterion {
  return { id: newId("crit"), text, kind };
}

export function newExample(input: string, expectedOutput?: string): Example {
  return { id: newId("ex"), input, expectedOutput };
}

export function newPowerTag(text: string, source: PowerTag["source"] = "manual"): PowerTag {
  return { id: newId("power"), text, source, confirmed: source === "manual" };
}

/** Asks the AI-suggest endpoint for candidate "what does this power" tags — always unconfirmed. */
export async function suggestPowerTags(spec: SpecProject): Promise<PowerTag[]> {
  const { tags } = await suggestPowersRemote(spec);
  return tags.map((t) => newPowerTag(t, "ai"));
}

export function newAssertionManual(tier: AssertionTier = "deterministic"): Assertion {
  const base: Assertion = {
    id: newId("assert"),
    sourceCriterionId: null,
    tier,
    description: "New assertion — describe the check",
    status: "draft",
  };
  if (tier === "custom_code") {
    return {
      ...base,
      description: "New custom-code assertion",
      code: "// Return true/false, or { pass, reason }\nreturn output.length > 0;",
      codeLanguage: "javascript",
    };
  }
  if (tier === "rubric_grading") {
    return { ...base, description: "New LLM-judge assertion", rubric: "Judge whether the output satisfies: \"...\". Answer pass or fail." };
  }
  return { ...base, check: { mode: "contains", value: "" } };
}

/** Editing content that was part of a published bundle forks it back to draft. */
export function markEdited(s: SpecProject): SpecProject {
  return s.status === "published" ? { ...s, status: "draft" } : s;
}

/**
 * Commits a Prompt edit (from the Playground or the embedded Prompt pane) onto a Spec's Target:
 * mints a fresh version and archives whatever was active before it — the same versioning behavior
 * as a regenerate — and forks the Spec back to draft if it was published. `copiedFromPromptId` is
 * stamped when the content came from inserting a different Prompt from the catalog, not an edit.
 */
export function applyPromptEditToSpec(spec: SpecProject, patch: PromptVersionPatch, copiedFromPromptId?: string): SpecProject {
  const now = Date.now();
  const newTarget: TargetVersion = {
    id: newId("target"),
    promptContent: patch.promptContent,
    model: patch.model,
    temperature: patch.temperature,
    status: patch.status ?? "draft",
    createdAt: now,
    copiedFromPromptId,
    messages: patch.messages,
    tools: patch.tools,
    outputSchema: patch.outputSchema,
  };
  return markEdited({
    ...spec,
    target: newTarget,
    promptHistory: spec.target ? [spec.target, ...spec.promptHistory] : spec.promptHistory,
    updatedAt: now,
  });
}

/** Generates only the requested artifacts. Running the resulting bundle is always a separate action. */
export async function generateFromSpec(
  spec: SpecProject,
  selection: GenerateSelection,
): Promise<SpecProject> {
  const bundle = await generateBundleRemote(spec, selection);
  const generatedTarget = bundle.target
    ? { ...bundle.target, id: newId("target"), createdAt: Date.now() }
    : spec.target;
  const promptHistory =
    bundle.target && spec.target ? [spec.target, ...spec.promptHistory] : spec.promptHistory;

  return {
    ...spec,
    target: generatedTarget,
    promptHistory,
    assertions: bundle.assertions ?? spec.assertions,
    judge: bundle.assertions ? (bundle.judge ?? null) : spec.judge,
    dataset: bundle.dataset ?? spec.dataset,
    datasetStatus: bundle.dataset ? "draft" : spec.datasetStatus,
    evalStatus: bundle.assertions ? "draft" : spec.evalStatus,
    datasetLibraryOrigin: bundle.dataset ? undefined : spec.datasetLibraryOrigin,
    status: spec.status === "published" ? "draft" : spec.status,
    lastGenerationMode: bundle.mode,
    updatedAt: Date.now(),
  };
}

/** `itemIds`, when provided and non-empty, re-runs only that subset of the Dataset — a sample run. */
export async function rerun(spec: SpecProject, itemIds?: string[]): Promise<SpecProject> {
  const { results, mode } = await runSuiteRemote(spec, itemIds);
  const run = finalizeRun(spec, results, mode, itemIds && itemIds.length > 0 ? "sample" : "full");
  return { ...spec, runs: [...spec.runs, run], updatedAt: run.createdAt };
}
