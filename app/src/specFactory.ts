import type {
  Assertion,
  AssertionTier,
  Example,
  GenerateArtifact,
  GenerateSelection,
  IOField,
  IOFieldType,
  LibraryVisibility,
  OpenQuestion,
  OutputMode,
  Requirement,
  SpecProject,
  SpecSyncState,
  TargetVersion,
} from "./types";
import { newId } from "./utils/id";
import { DEFAULT_TARGET_MODEL, finalizeRun } from "./engine";
import { generateBundleRemote, runSuiteRemote } from "./api";
import { carryForwardAnnotations } from "./results";
import type { PromptVersionPatch } from "./promptFactory";

const ARTIFACTS: GenerateArtifact[] = ["prompt", "assertions", "dataset"];

function blankSyncState(at: number): SpecSyncState {
  return { briefUpdatedAt: at, prompt: {}, assertions: {}, dataset: {} };
}

export function createBlankSpec(
  name: string,
  ownerId: string,
  visibility: LibraryVisibility = "org",
): SpecProject {
  const now = Date.now();
  return {
    id: newId("spec"),
    name,
    goal: "",
    context: "",
    inputFields: [],
    outputFields: [],
    outputMode: "text",
    requirements: [],
    openQuestions: [],
    examples: [],
    target: null,
    promptHistory: [],
    assertions: [],
    judge: null,
    dataset: [],
    defaultPassThreshold: 1,
    runs: [],
    comments: [],
    verdict: "pending",
    released: false,
    ownerId,
    updatedByUserId: ownerId,
    visibility,
    access: [],
    syncState: blankSyncState(now),
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
  const reqMap = new Map<string, string>();

  const requirements: Requirement[] = source.requirements.map((r) => {
    const id = newId("req");
    reqMap.set(r.id, id);
    return { ...r, id };
  });
  const inputFields: IOField[] = source.inputFields.map((f) => ({ ...f, id: newId("io") }));
  const outputFields: IOField[] = source.outputFields.map((f) => ({ ...f, id: newId("io") }));
  const openQuestions: OpenQuestion[] = source.openQuestions.map((q) => ({ ...q, id: newId("oq") }));

  return syncJudgePolicy({
    ...source,
    id: newId("spec"),
    name: name?.trim() || `${source.name} (new version)`,
    requirements,
    inputFields,
    outputFields,
    openQuestions,
    examples: source.examples.map((e) => ({ ...e, id: newId("ex") })),
    target: source.target
      ? { ...source.target, id: newId("target"), status: "draft", createdAt: now, copiedFromPromptId: undefined }
      : null,
    promptHistory: [],
    assertions: source.assertions.map((a) => ({
      ...a,
      id: newId("assert"),
      sourceRequirementId: a.sourceRequirementId ? (reqMap.get(a.sourceRequirementId) ?? null) : null,
      check: a.check ? { ...a.check } : undefined,
    })),
    judge: source.judge ? { ...source.judge, id: newId("judge") } : null,
    dataset: source.dataset.map((d) => ({ ...d, id: newId("item") })),
    datasetLibraryOrigin: undefined,
    runs: [],
    comments: [],
    verdict: "pending",
    released: false,
    lastGenerationMode: undefined,
    ownerId,
    updatedByUserId: ownerId,
    visibility: "org",
    access: [],
    appliedFeature: source.appliedFeature,
    usageStats: undefined,
    forkedFromId: source.id,
    forkedFromName: source.name,
    // A fresh fork starts "in sync" — nothing has diverged yet, even though content was copied
    // rather than freshly generated.
    syncState: {
      briefUpdatedAt: now,
      prompt: source.target ? { generatedAt: now } : {},
      assertions: source.assertions.length > 0 ? { generatedAt: now } : {},
      dataset: source.dataset.length > 0 ? { generatedAt: now } : {},
    },
    createdAt: now,
    updatedAt: now,
  });
}

/** Short, scannable label auto-derived from a requirement's full statement, e.g. for quick-add flows. */
export function deriveRequirementName(statement: string): string {
  const words = statement.trim().split(/\s+/).filter(Boolean).slice(0, 5);
  const raw = words.join(" ").replace(/[.!?,;:]+$/, "");
  return raw.length > 0 ? raw.slice(0, 48) : "Requirement";
}

export function newRequirement(statement: string, name?: string): Requirement {
  return { id: newId("req"), name: name?.trim() || deriveRequirementName(statement), statement };
}

export function newExample(input: string, expectedOutput?: string, comment?: string): Example {
  return { id: newId("ex"), input, expectedOutput, comment };
}

export function newIOField(name = "", type: IOFieldType = "string"): IOField {
  return { id: newId("io"), name, type, required: true, description: "" };
}

export function newOpenQuestion(text: string): OpenQuestion {
  return { id: newId("oq"), text, resolved: false };
}

/** Every `OutputMode` in a fixed, stable display order — cheapest/most-common first. */
export const OUTPUT_MODES: { value: OutputMode; label: string }[] = [
  { value: "text", label: "Plain text" },
  { value: "json_schema", label: "JSON schema" },
  { value: "tool_call", label: "Function / tool call" },
];

export function newAssertionManual(tier: AssertionTier = "deterministic"): Assertion {
  const base: Assertion = {
    id: newId("assert"),
    sourceRequirementId: null,
    tier,
    description: "New assertion — describe the check",
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

/**
 * A Spec is published iff its current Target (the Spec's mirrored Prompt version) is published —
 * there's no separate Spec-level publish flag. Editing the Prompt content itself already forks a
 * fresh draft Target (see `applyPromptEditToSpec`), which is what naturally "un-publishes" a Spec;
 * editing Assertions/Dataset/other Spec fields has no effect on this.
 */
export function isSpecPublished(spec: SpecProject): boolean {
  return spec.target?.status === "published";
}

// ---- Raw JSON view/edit of a Spec's brief ------------------------------------------------------
//
// The "brief" is exactly what SpecPane edits field-by-field: name/goal/context/I-O contracts/
// requirements/examples/openQuestions — not the generated artifacts (Target/Assertions/
// Dataset/Runs), which have their own tabs. IDs are stripped on the way out and reminted on the
// way in (unless the pasted JSON already has one) so this doubles as an import format for a real
// spec doc shaped like this (see e.g. CQA-spec.txt) pasted in from elsewhere.

const IO_FIELD_TYPES_LIST: IOFieldType[] = ["string", "number", "boolean", "object", "array"];
const OUTPUT_MODE_VALUES: OutputMode[] = ["text", "json_schema", "tool_call"];

export function specBriefToJson(spec: SpecProject): string {
  const brief = {
    name: spec.name,
    goal: spec.goal,
    context: spec.context,
    inputFields: spec.inputFields.map(({ name, type, required, description }) => ({ name, type, required, description })),
    outputFields: spec.outputFields.map(({ name, type, required, description }) => ({ name, type, required, description })),
    outputMode: spec.outputMode,
    outputToolName: spec.outputToolName,
    requirements: spec.requirements.map(({ name, statement }) => ({ name, statement })),
    examples: spec.examples.map(({ input, expectedOutput, comment }) => ({ input, expectedOutput, comment })),
    openQuestions: spec.openQuestions.map(({ text, resolved }) => ({ text, resolved })),
  };
  return JSON.stringify(brief, null, 2);
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function asBool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * Parses raw JSON text (as produced by `specBriefToJson`, or a hand-written/pasted equivalent)
 * and applies it on top of `spec`, replacing only the brief fields it recognizes. Unknown/missing
 * fields fall back to the current value rather than erroring, so a partial edit (e.g. just
 * `{"requirements": [...]}`) still applies cleanly. Throws only when the text isn't valid JSON or
 * isn't an object, so the caller can show one clear error message.
 */
export function applySpecBriefJson(spec: SpecProject, json: string): SpecProject {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object.");
  }
  const p = parsed as Record<string, unknown>;

  const inputFields: IOField[] = "inputFields" in p
    ? asArray(p.inputFields).map((raw) => {
        const f = (raw ?? {}) as Record<string, unknown>;
        return {
          id: typeof f.id === "string" ? f.id : newId("io"),
          name: asString(f.name),
          type: IO_FIELD_TYPES_LIST.includes(f.type as IOFieldType) ? (f.type as IOFieldType) : "string",
          required: asBool(f.required, true),
          description: asString(f.description),
        };
      })
    : spec.inputFields;

  const outputFields: IOField[] = "outputFields" in p
    ? asArray(p.outputFields).map((raw) => {
        const f = (raw ?? {}) as Record<string, unknown>;
        return {
          id: typeof f.id === "string" ? f.id : newId("io"),
          name: asString(f.name),
          type: IO_FIELD_TYPES_LIST.includes(f.type as IOFieldType) ? (f.type as IOFieldType) : "string",
          required: asBool(f.required, true),
          description: asString(f.description),
        };
      })
    : spec.outputFields;

  const requirements: Requirement[] = "requirements" in p
    ? asArray(p.requirements).map((raw) => {
        const r = (raw ?? {}) as Record<string, unknown>;
        const statement = asString(r.statement);
        return {
          id: typeof r.id === "string" ? r.id : newId("req"),
          name: asString(r.name) || deriveRequirementName(statement),
          statement,
        };
      })
    : spec.requirements;

  const examples: Example[] = "examples" in p
    ? asArray(p.examples).map((raw) => {
        const e = (raw ?? {}) as Record<string, unknown>;
        return {
          id: typeof e.id === "string" ? e.id : newId("ex"),
          input: asString(e.input),
          expectedOutput: typeof e.expectedOutput === "string" ? e.expectedOutput : undefined,
          comment: typeof e.comment === "string" ? e.comment : undefined,
        };
      })
    : spec.examples;

  const openQuestions: OpenQuestion[] = "openQuestions" in p
    ? asArray(p.openQuestions).map((raw) => {
        const q = (raw ?? {}) as Record<string, unknown>;
        return {
          id: typeof q.id === "string" ? q.id : newId("oq"),
          text: asString(q.text),
          resolved: asBool(q.resolved),
        };
      })
    : spec.openQuestions;

  return markBriefEdited({
    ...spec,
    name: asString(p.name, spec.name),
    goal: asString(p.goal, spec.goal),
    context: asString(p.context, spec.context),
    inputFields,
    outputFields,
    outputMode: OUTPUT_MODE_VALUES.includes(p.outputMode as OutputMode) ? (p.outputMode as OutputMode) : spec.outputMode,
    outputToolName: typeof p.outputToolName === "string" ? p.outputToolName : spec.outputToolName,
    requirements,
    examples,
    openQuestions,
    updatedAt: Date.now(),
  });
}

/**
 * Keeps the Judge Policy's existence in sync with whether any `rubric_grading` assertion exists —
 * there's no manual "remove" for it (a Judge with zero LLM assertions to grade makes no sense).
 * Auto-creates a fresh default policy (no overrides, so `judgeDefaults.ts`'s defaults apply) the
 * moment the first rubric assertion appears, and clears it the moment the last one is removed.
 * Call this after any change to `spec.assertions`.
 */
export function syncJudgePolicy(spec: SpecProject): SpecProject {
  const needsJudge = spec.assertions.some((a) => a.tier === "rubric_grading");
  if (needsJudge && !spec.judge) {
    return { ...spec, judge: { id: newId("judge"), model: DEFAULT_TARGET_MODEL } };
  }
  if (!needsJudge && spec.judge) {
    return { ...spec, judge: null };
  }
  return spec;
}

// ---- Spec ↔ artifact divergence tracking ------------------------------------------------------
//
// A Spec's brief (goal/context/contracts/requirements/examples) describes the intent that Generate
// turns into a Prompt/Assertions/Dataset. Nothing keeps those in lockstep automatically, so this
// tracks, per artifact, when it was last generated vs. last hand-edited outside Generate — enough
// to warn the user when an artifact may no longer reflect the brief (or vice versa).

export function getSyncState(spec: SpecProject): SpecSyncState {
  return spec.syncState ?? blankSyncState(spec.updatedAt);
}

/** Call whenever the Spec's brief (goal/context/contracts/requirements/examples) is hand-edited. */
export function markBriefEdited(spec: SpecProject): SpecProject {
  return { ...spec, syncState: { ...getSyncState(spec), briefUpdatedAt: Date.now() } };
}

/** Call whenever an artifact is hand-edited (or loaded from the Library) outside of Generate. */
export function markArtifactManuallyEdited(spec: SpecProject, artifact: GenerateArtifact): SpecProject {
  const syncState = getSyncState(spec);
  return {
    ...spec,
    syncState: { ...syncState, [artifact]: { ...syncState[artifact], manualEditAt: Date.now() } },
  };
}

export interface ArtifactStaleness {
  /** This artifact was hand-edited (or Library-loaded) more recently than it was last generated. */
  manuallyEdited: boolean;
  /** The Spec brief changed after this artifact was last generated. */
  briefChangedSince: boolean;
}

export function getArtifactStaleness(spec: SpecProject, artifact: GenerateArtifact): ArtifactStaleness {
  const syncState = getSyncState(spec);
  const info = syncState[artifact];
  return {
    manuallyEdited: !!info.manualEditAt && (!info.generatedAt || info.manualEditAt > info.generatedAt),
    briefChangedSince: !!info.generatedAt && syncState.briefUpdatedAt > info.generatedAt,
  };
}

/** True if any artifact may no longer match the Spec brief — see `getArtifactStaleness`. */
export function isSpecStale(spec: SpecProject): boolean {
  return ARTIFACTS.some((a) => {
    const s = getArtifactStaleness(spec, a);
    return s.manuallyEdited || s.briefChangedSince;
  });
}

/**
 * Commits a Prompt edit (from the Playground or the embedded Prompt pane) onto a Spec's Target:
 * mints a fresh version and archives whatever was active before it — the same versioning behavior
 * as a regenerate — which is also what un-publishes the Spec if it was published (the new Target
 * always starts as a draft). `copiedFromPromptId` is stamped when the content came from inserting
 * a different Prompt from the catalog, not an edit.
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
    settings: patch.settings,
  };
  const syncState = getSyncState(spec);
  return {
    ...spec,
    target: newTarget,
    promptHistory: spec.target ? [spec.target, ...spec.promptHistory] : spec.promptHistory,
    syncState: { ...syncState, prompt: { ...syncState.prompt, manualEditAt: now } },
    updatedAt: now,
  };
}

/** Generates only the requested artifacts. Running the resulting bundle is always a separate action. */
export async function generateFromSpec(
  spec: SpecProject,
  selection: GenerateSelection,
  signal?: AbortSignal,
): Promise<SpecProject> {
  const bundle = await generateBundleRemote(spec, selection, signal);
  const generatedTarget = bundle.target
    ? { ...bundle.target, id: newId("target"), createdAt: Date.now() }
    : spec.target;
  const promptHistory =
    bundle.target && spec.target ? [spec.target, ...spec.promptHistory] : spec.promptHistory;

  const now = Date.now();
  const syncState = getSyncState(spec);
  const nextSyncState: SpecSyncState = { ...syncState };
  // Regenerating an artifact is what re-syncs it with the current brief — clears any prior
  // manual-edit/brief-changed staleness for that artifact specifically.
  if (bundle.target) nextSyncState.prompt = { generatedAt: now };
  if (bundle.assertions) nextSyncState.assertions = { generatedAt: now };
  if (bundle.dataset) nextSyncState.dataset = { generatedAt: now };

  return syncJudgePolicy({
    ...spec,
    target: generatedTarget,
    promptHistory,
    assertions: bundle.assertions ?? spec.assertions,
    judge: bundle.assertions ? (bundle.judge ?? null) : spec.judge,
    dataset: bundle.dataset ?? spec.dataset,
    datasetLibraryOrigin: bundle.dataset ? undefined : spec.datasetLibraryOrigin,
    lastGenerationMode: bundle.mode,
    syncState: nextSyncState,
    updatedAt: now,
  });
}

/** `itemIds`, when provided and non-empty, re-runs only that subset of the Dataset — a sample run. */
export async function rerun(spec: SpecProject, itemIds?: string[], signal?: AbortSignal): Promise<SpecProject> {
  const { results, mode } = await runSuiteRemote(spec, itemIds, signal);
  const previousRun = spec.runs[spec.runs.length - 1];
  const run = finalizeRun(carryForwardAnnotations(results, previousRun), mode, itemIds && itemIds.length > 0 ? "sample" : "full");
  return { ...spec, runs: [...spec.runs, run], updatedAt: run.createdAt };
}
