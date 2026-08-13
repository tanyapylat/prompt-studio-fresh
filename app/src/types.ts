export type Status = "draft" | "published";
/**
 * Three reusable assertion tiers, cheapest-first:
 * - `deterministic`: a built-in, parameterized check (the promptfoo-parity catalog in `CodeCheckMode`) — no LLM call.
 * - `custom_code`: a user-authored function (JS/Python) run against the output — for logic the built-in catalog can't express.
 * - `rubric_grading`: an LLM-as-judge rubric — the most expensive tier, used only when the first two can't cover it.
 */
export type AssertionTier = "deterministic" | "custom_code" | "rubric_grading";
export type DatasetItemSource = "seed" | "synthetic" | "case-c";
export type GenerationMode = "live" | "simulated";
export type GenerateArtifact = "prompt" | "assertions" | "dataset";
export type GenerateSelection = Record<GenerateArtifact, boolean>;
export type LibraryVisibility = "private" | "org";
export type CodeLanguage = "javascript" | "python";

export interface MockUser {
  id: string;
  name: string;
  initials: string;
}

export interface Criterion {
  id: string;
  text: string;
  kind: "criterion" | "guardrail";
}

export interface Example {
  id: string;
  input: string;
  expectedOutput?: string;
}

/**
 * The deterministic, built-in check catalog — modeled on promptfoo's non-model-graded assertion
 * types, so "deterministic" means "the same built-in library promptfoo ships", not a bespoke set.
 */
export type CodeCheckMode =
  | "equals"
  | "contains"
  | "icontains"
  | "excludes"
  | "contains_all"
  | "contains_any"
  | "icontains_all"
  | "icontains_any"
  | "starts_with"
  | "regex_match"
  | "regex_excludes"
  | "enum"
  | "valid_json"
  | "contains_json"
  | "is_xml"
  | "contains_xml"
  | "contains_sql"
  | "levenshtein"
  | "rouge_n"
  | "latency"
  | "cost";

export interface CodeCheck {
  mode: CodeCheckMode;
  /**
   * equals/contains/icontains/excludes/starts_with: the literal phrase.
   * contains_all/contains_any/icontains_all/icontains_any: comma-separated phrases.
   * regex_match/regex_excludes: a regular expression source (passes when it does/doesn't match).
   * enum: comma-separated list of the only allowed exact outputs (case-insensitive, trimmed).
   * valid_json/contains_json/is_xml/contains_xml/contains_sql: unused.
   * levenshtein/rouge_n: unused — the comparison text lives in `reference`.
   * latency/cost: unused — the limit lives in `threshold` (ms / USD).
   */
  value: string;
  /** levenshtein: max edit distance to pass. rouge_n: min overlap score (0-1). latency: max ms. cost: max USD. */
  threshold?: number;
  /** levenshtein/rouge_n: the reference string the output is compared against. */
  reference?: string;
}

export interface Assertion {
  id: string;
  sourceCriterionId: string | null;
  tier: AssertionTier;
  description: string;
  check?: CodeCheck;
  rubric?: string;
  /** custom_code only: the function body, run against `output` (and `input`). */
  code?: string;
  /** custom_code only. JavaScript actually executes in-browser; Python is stored but not run (no in-browser runtime). */
  codeLanguage?: CodeLanguage;
  status: Status;
  /** Id of the LibraryAssertion this was copied from, if any. A one-time stamp — not a live link. */
  libraryOrigin?: string;
  /** Free-text bucket for organizing the Eval pane's assertion list (e.g. "Guardrails", "Tone"). Undefined = ungrouped. */
  group?: string;
  /**
   * Fraction (0-1) of dataset rows this specific assertion must pass for it to count as "passing"
   * in the Results rollup. Undefined = fall back to `SpecProject.defaultPassThreshold`.
   */
  passThreshold?: number;
}

export interface JudgePolicy {
  id: string;
  model: string;
  /** Id of the LibraryJudgePolicy this was copied from, if any. A one-time stamp — not a live link. */
  libraryOrigin?: string;
  /** Overrides the built-in grading system prompt (see `judgeDefaults.ts`) when set. */
  systemPrompt?: string;
  /** Overrides the default grading temperature (0) when set. */
  temperature?: number;
}

export interface DatasetItem {
  id: string;
  input: string;
  source: DatasetItemSource;
  expectedOutput?: string;
  /**
   * Full name→value map for every variable the current Target's messages reference (see
   * `datasetVariableNames` in `dataset.ts`). Always includes `input` when present, kept in sync
   * with the top-level `input` field so older rows/consumers that only know about `input` keep
   * working unchanged. Undefined on legacy rows that predate multi-variable datasets.
   */
  variables?: Record<string, string>;
}

/**
 * Roles for the structured Playground message editor — named LangChain-style (System/Human/AI)
 * to match how the messages are authored, mapped to OpenAI's system/user/assistant at request time.
 */
export type PromptRole = "system" | "human" | "ai";

export interface PromptMessage {
  id: string;
  role: PromptRole;
  content: string;
}

/** A function-calling tool definition for the Playground. Parameters are edited as raw JSON text. */
export interface PromptTool {
  id: string;
  name: string;
  description: string;
  /** Raw JSON Schema text for the parameters object — edited as text, parsed before a live Run. */
  parameters: string;
}

/** Structured-output config for the Playground. Schema is edited as raw JSON text. */
export interface PromptOutputSchema {
  enabled: boolean;
  name: string;
  /** Raw JSON Schema text — edited as text, parsed before a live Run. */
  schema: string;
}

export interface TargetVersion {
  id: string;
  promptContent: string;
  model: string;
  temperature: number;
  status: Status;
  /** Id of the Prompt this was copied from, if any. A one-time stamp — not a live link. */
  copiedFromPromptId?: string;
  /** When this version became the active Target — absent on older seed data. */
  createdAt?: number;
  /**
   * Structured Playground template mirrored alongside `promptContent` — optional so older/simpler
   * data (and the untouched Generate flow) stay valid. `promptContent` always equals the flattened
   * System message content, so the Eval Suite never needs to know these exist.
   */
  messages?: PromptMessage[];
  tools?: PromptTool[];
  outputSchema?: PromptOutputSchema;
}

/** A single immutable revision of a Prompt's content — history is append-only. */
export interface PromptVersion {
  id: string;
  /** 1, 2, 3… in creation order, for display (e.g. "v3"). */
  version: number;
  promptContent: string;
  model: string;
  temperature: number;
  status: Status;
  createdAt: number;
  /** Structured Playground template for this version — see TargetVersion for why this is optional. */
  messages?: PromptMessage[];
  tools?: PromptTool[];
  outputSchema?: PromptOutputSchema;
}

/**
 * Uncommitted Playground edits, kept alongside the version history so experimenting never mints a
 * version. Only becomes a PromptVersion when the author explicitly saves it.
 */
export interface PromptDraft {
  promptContent: string;
  model: string;
  temperature: number;
  /** The version these edits started from. */
  baseVersionId: string;
  updatedAt: number;
  messages?: PromptMessage[];
  tools?: PromptTool[];
  outputSchema?: PromptOutputSchema;
}

/**
 * A first-class, versioned Prompt. Every Spec's Target is automatically mirrored here
 * (`specId` set) so it shows up in one unified catalog; Prompts can also be created directly,
 * independent of any Spec (`specId: null`).
 */
export interface Prompt {
  id: string;
  name: string;
  description: string;
  tags: string[];
  ownerId: string;
  visibility: LibraryVisibility;
  /** The Spec this Prompt is mirrored from, or null if it's a standalone Prompt. */
  specId: string | null;
  /** Oldest first — the current working version is `versions[versions.length - 1]` by convention. */
  versions: PromptVersion[];
  activeVersionId: string;
  /** Work in progress that hasn't been committed to a version yet. */
  draft?: PromptDraft | null;
  createdAt: number;
  updatedAt: number;
}

export interface AssertionScore {
  assertionId: string;
  passed: boolean;
  reason: string;
}

export interface RunItemResult {
  datasetItemId: string;
  output: string;
  scores: AssertionScore[];
  note?: string;
}

export interface RunGroup {
  id: string;
  createdAt: number;
  citable: boolean;
  mode: GenerationMode;
  results: RunItemResult[];
  passRate: number;
  /**
   * `"sample"` when this run only scored a chosen subset of the Dataset (random or hand-picked
   * rows) rather than every row — useful for a quick check before running a huge dataset in full.
   * Sample runs are never citable, regardless of publish status.
   */
  scope: "full" | "sample";
}

export interface Comment {
  id: string;
  author: string;
  authorKind: "human" | "ai";
  text: string;
  anchor: string;
  resolved: boolean;
  createdAt: number;
}

export type Verdict = "pending" | "approved" | "changes_requested";

/** A role explicitly granted to one person on top of the base owner/visibility split. */
export type SpecRole = "editor" | "viewer";

export interface AccessGrant {
  userId: string;
  role: SpecRole;
}

/**
 * A "what does this power" label — e.g. "Chatbot Conversation Module". Either typed by hand or
 * suggested by the AI-suggest action from the Goal/Output contract; AI suggestions always start
 * unconfirmed and only count as real metadata once a human accepts them.
 */
export interface PowerTag {
  id: string;
  text: string;
  source: "ai" | "manual";
  confirmed: boolean;
}

export interface SpecProject {
  id: string;
  name: string;
  status: Status;
  goal: string;
  inputContract: string;
  outputContract: string;
  guardrails: Criterion[];
  criteria: Criterion[];
  examples: Example[];

  target: TargetVersion | null;
  /** Prior active Targets, most recent first — pushed here right before `target` is overwritten. */
  promptHistory: TargetVersion[];
  assertions: Assertion[];
  judge: JudgePolicy | null;
  dataset: DatasetItem[];
  datasetStatus: Status;
  /** Fraction (0-1) of dataset rows an assertion must pass by default — see `Assertion.passThreshold`. */
  defaultPassThreshold: number;
  evalStatus: Status;
  /** Id of the LibraryDataset the whole dataset was last loaded from, if any. Not a live link. */
  datasetLibraryOrigin?: string;

  runs: RunGroup[];
  comments: Comment[];
  verdict: Verdict;
  released: boolean;

  /** Whether the most recent Generate actually called a live LLM or fell back to simulation. */
  lastGenerationMode?: GenerationMode;

  ownerId: string;
  visibility: LibraryVisibility;
  /** Explicit per-person role grants, on top of the owner and the private/org default. */
  access: AccessGrant[];
  /** What product/feature surface this Spec powers — free text, AI-suggested or hand-typed. */
  powers: PowerTag[];

  /** Set when this Spec was forked as a new version of another Spec. */
  forkedFromId?: string;
  forkedFromName?: string;

  createdAt: number;
  updatedAt: number;
}

/** Shared metadata for every reusable, org-browsable Library entity. */
export interface LibraryMeta {
  id: string;
  name: string;
  description: string;
  tags: string[];
  ownerId: string;
  visibility: LibraryVisibility;
  usageCount: number;
  /** Ids of every Spec this entry has been pinned into — "where" it's used, not just "how many times". */
  usedInSpecIds: string[];
  /** Which Spec this entry was originally saved from, if any — provenance, not a live link. */
  sourceSpecId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface LibraryAssertion extends LibraryMeta {
  tier: AssertionTier;
  description: string;
  check?: CodeCheck;
  rubric?: string;
  code?: string;
  codeLanguage?: CodeLanguage;
  group?: string;
  passThreshold?: number;
}

export interface LibraryDataset extends LibraryMeta {
  items: DatasetItem[];
}

export interface LibraryJudgePolicy extends LibraryMeta {
  model: string;
  systemPrompt?: string;
  temperature?: number;
}

export type LibraryKind = "assertions" | "datasets" | "judgePolicies";

export interface Library {
  assertions: LibraryAssertion[];
  datasets: LibraryDataset[];
  judgePolicies: LibraryJudgePolicy[];
}
