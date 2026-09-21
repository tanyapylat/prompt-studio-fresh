export type Status = "draft" | "published";
/**
 * Three reusable assertion tiers, cheapest-first:
 * - `deterministic`: a built-in, parameterized check (the promptfoo-parity catalog in `CodeCheckMode`) — no LLM call.
 * - `custom_code`: a user-authored function (JS/Python) run against the output — for logic the built-in catalog can't express.
 * - `rubric_grading`: an LLM-as-judge rubric — the most expensive tier, used only when the first two can't cover it.
 */
export type AssertionTier = "deterministic" | "custom_code" | "rubric_grading";
export type DatasetItemSource = "synthetic" | "manual";
export type GenerationMode = "live" | "simulated";
export type GenerateArtifact = "prompt" | "assertions" | "dataset";
export type GenerateSelection = Record<GenerateArtifact, boolean>;
export type LibraryVisibility = "private" | "org";
export type CodeLanguage = "javascript" | "python";

export interface MockUser {
  id: string;
  name: string;
  initials: string;
  /** Standing in for real SSO/auth identity — shown as-is in the Eval runs list's Author column. */
  email: string;
}

/**
 * A single, flat requirement statement — deliberately NOT split into "guardrail" vs. "criterion"
 * buckets (that split proved artificial against real Specs, which just enumerate a flat list of
 * things the output must always or must never do). `name` is a short, scannable label; `statement`
 * is the full rule text — matches the shape of real production Spec documents.
 */
export interface Requirement {
  id: string;
  name: string;
  statement: string;
}

/**
 * A question the Spec author hasn't resolved yet — e.g. a known ambiguity, a modeling tradeoff, or
 * a gap discovered while writing the brief. First-class (not buried in free text) so it's visible
 * to reviewers and to North Star, matching real production Spec documents.
 */
export interface OpenQuestion {
  id: string;
  text: string;
  resolved: boolean;
}

export interface Example {
  id: string;
  input: string;
  expectedOutput?: string;
  /** Why this example is here / what it's illustrating — e.g. why an edge case resolves the way it does. */
  comment?: string;
}

/** Scalar/structural types available for a typed Input/Output contract field. */
export type IOFieldType = "string" | "number" | "boolean" | "object" | "array";

/**
 * One typed field of a Spec's Input or Output contract — matches how real production Specs
 * declare their I/O shape (name/type/required/description) instead of a free-text paragraph.
 */
export interface IOField {
  id: string;
  name: string;
  type: IOFieldType;
  required: boolean;
  description: string;
}

/**
 * How the Output contract's fields are actually delivered by the Target:
 * - `text`: an unstructured string completion (the common case — `outputFields` still documents
 *   the single value's shape/description for reference, even though nothing enforces it).
 * - `json_schema`: a JSON object matching `outputFields`, enforced via a structured-output schema.
 * - `tool_call`: the fields are the arguments of a forced function/tool call (see `outputToolName`).
 */
export type OutputMode = "text" | "json_schema" | "tool_call";

/**
 * The deterministic, built-in check catalog — modeled on promptfoo's non-model-graded assertion
 * types, so "deterministic" means "the same built-in library promptfoo ships", not a bespoke set.
 */
export type CodeCheckMode =
  | "equals"
  | "not_equals"
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
  | "contains_html"
  | "levenshtein"
  | "rouge_n"
  | "latency"
  | "cost"
  | "not_contains_any"
  | "not_icontains_any"
  | "word_count";

export interface CodeCheck {
  mode: CodeCheckMode;
  /**
   * equals/not_equals/contains/icontains/excludes/starts_with: the literal phrase.
   * contains_all/contains_any/icontains_all/icontains_any/not_contains_any/not_icontains_any: comma-separated phrases.
   * regex_match/regex_excludes: a regular expression source (passes when it does/doesn't match).
   * enum: comma-separated list of the only allowed exact outputs (case-insensitive, trimmed).
   * valid_json/contains_json/is_xml/contains_xml/contains_sql/contains_html/word_count: unused (word_count uses `min`/`max` instead).
   * levenshtein/rouge_n: unused — the comparison text lives in `reference`.
   * latency/cost: unused — the limit lives in `threshold` (ms / USD).
   */
  value: string;
  /** levenshtein: max edit distance to pass. rouge_n: min overlap score (0-1). latency: max ms. cost: max USD. */
  threshold?: number;
  /** levenshtein/rouge_n: the reference string the output is compared against. */
  reference?: string;
  /** word_count only: inclusive lower/upper bounds on the output's word count. At least one of the two should be set; both set means a range, one set means "at least"/"at most". */
  min?: number;
  max?: number;
}

export interface Assertion {
  id: string;
  /** Id of the Requirement this assertion covers, or null if it was added manually/from the Library. */
  sourceRequirementId: string | null;
  tier: AssertionTier;
  description: string;
  check?: CodeCheck;
  rubric?: string;
  /** custom_code only: the function body, run against `output` (and `input`). */
  code?: string;
  /** custom_code only. JavaScript actually executes in-browser; Python is stored but not run (no in-browser runtime). */
  codeLanguage?: CodeLanguage;
  /** Id of the LibraryAssertion this was copied from, if any. A one-time stamp — not a live link. */
  libraryOrigin?: string;
  /** Free-text bucket for organizing the Eval pane's assertion list (e.g. "Guardrails", "Tone"). Undefined = ungrouped. */
  group?: string;
  /**
   * Fraction (0-1) of dataset rows this specific assertion must pass for it to count as "passing"
   * in the Results rollup. Undefined = fall back to `SpecProject.defaultPassThreshold`.
   */
  passThreshold?: number;
  /**
   * Composite/grouped assertion — promptfoo's `assert-set` (e.g. several weighted sub-checks
   * rolled into one named assertion with its own pass threshold; real-world example: an "H1 tag
   * quality" assertion averaging a length check, a keyword check, and a tone check). When this is
   * set, THIS assertion's own `tier`/`check`/`code`/`rubric` are not used for scoring — each
   * child is scored independently by its own tier, then this assertion's score is the weighted
   * average of the children's scores (see `weight`) and it passes when that average reaches
   * `groupThreshold`. `tier` is still set (arbitrarily, to keep every other tier-driven code path
   * — Library, the Eval pane's 3-tier layout — working unmodified) but should be ignored by
   * anything that already checks `children` first; see `AssertionScore.childScores` for how a
   * row's per-child breakdown is carried alongside the group's own aggregate score.
   */
  children?: Assertion[];
  /** Only meaningful on a `children` entry of some other assertion — its share of the parent group's weighted-average score. Undefined = 1 (equal weight). */
  weight?: number;
  /** Composite/grouped assertion only: weighted-average score (0-1) `children` must reach for this assertion to pass. Undefined = 0.5. */
  groupThreshold?: number;
}

export interface JudgePolicy {
  id: string;
  model: string;
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
  /** When this row was created — undefined on legacy/seed/synthetic rows that predate this field. */
  createdAt?: number;
  /** When this row's fields were last edited — undefined on legacy rows; equals `createdAt` on unedited rows. */
  updatedAt?: number;
  /**
   * Reviewer annotation on the dataset row itself — persistent and independent of any particular
   * Run (unlike `RunItemResult.labels`, which describes one Run's output for this row and gets
   * carried forward copy-by-copy across reruns). Use this for observations about the row itself,
   * e.g. "this is an edge case" or "ambiguous phrasing", that should stick around no matter how
   * the prompt changes.
   */
  note?: string;
  /** Short, filterable tags on the dataset row itself — same UI/semantics as `RunItemResult.labels`, one level up. */
  labels?: string[];
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

/**
 * The "Config gear" parameters beyond model/temperature — everything here is optional so legacy
 * content (and the plain Generate flow) stays valid without ever having touched these. Undefined
 * means "provider default", not zero, for every numeric field.
 */
export interface PromptSettings {
  /** Sent as `max_completion_tokens` — caps the length of the completion. */
  maxTokens?: number;
  /** Nucleus sampling, 0-1. */
  topP?: number;
  /** -2 to 2. Penalizes tokens by how often they've already appeared. */
  frequencyPenalty?: number;
  /** -2 to 2. Penalizes tokens that have appeared at all, encouraging new topics. */
  presencePenalty?: number;
  /** Best-effort reproducibility across identical requests. */
  seed?: number;
  /** Up to 4 sequences where the API stops generating further tokens. */
  stopSequences?: string[];
  /** Raw JSON text mapping a token id to a bias from -100 to 100, e.g. {"50256": -100}. */
  logitBias?: string;
  /** Client-side request timeout, in milliseconds. */
  timeoutMs?: number;
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
   * The real numeric version id from the production Prompt Management system — distinct from
   * this Target's own `id`, which is only an AI Studio-internal key. Undefined until this exact
   * version has actually been published/synced there (e.g. a fresh, never-published draft has no
   * id yet). This is the id real eval-run tooling reports alongside a project id — see
   * `SpecProject.psProjectId`.
   */
  psVersionId?: number;
  /**
   * Structured Playground template mirrored alongside `promptContent` — optional so older/simpler
   * data (and the untouched Generate flow) stay valid. `promptContent` always equals the flattened
   * System message content, so the Eval Suite never needs to know these exist.
   */
  messages?: PromptMessage[];
  tools?: PromptTool[];
  outputSchema?: PromptOutputSchema;
  settings?: PromptSettings;
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
  /** Mirrored from the source `TargetVersion.psVersionId` (Spec-linked) — see there. Undefined for standalone Prompt versions or ones never published yet. */
  psVersionId?: number;
  /** Structured Playground template for this version — see TargetVersion for why this is optional. */
  messages?: PromptMessage[];
  tools?: PromptTool[];
  outputSchema?: PromptOutputSchema;
  settings?: PromptSettings;
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
  settings?: PromptSettings;
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
  /** Mirrored from `SpecProject.psProjectId` — see there. Undefined for standalone Prompts, which have no project id yet. */
  psProjectId?: number;
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
  /**
   * Continuous grading score in [0, 1], when the judge produces one — mirrors promptfoo's default
   * `llm-rubric` behavior (a rubric grade is a score, not just a binary pass/fail; deterministic
   * and custom_code checks still naturally collapse to 1 or 0). `passed` remains the authoritative
   * per-row outcome for rollups; `score` is preserved alongside it for display/analysis so nuance
   * like "0.3 vs 0.4 out of 1" isn't lost. Undefined on legacy rows that predate this field.
   */
  score?: number;
  /**
   * True when this specific assertion simply didn't apply to this row (seen in real exports —
   * e.g. a `one_detail_pet` check on a car-repair test case) — distinct from failing it. `passed`
   * is meaningless when this is true and should be ignored; the UI renders a neutral "n/a" chip
   * and every pass-rate rollup (row/assertion/run) excludes it from both numerator and denominator.
   */
  na?: boolean;
  /**
   * True when this specific assertion couldn't be evaluated at all — the grading code itself
   * threw (a `custom_code` bug, an invalid regex, a malformed reference) or the judge call failed
   * — as distinct from evaluating cleanly and legitimately failing. Mirrors Promptfoo's own
   * Pass/Fail/Error split, just scoped to one assertion instead of the whole row (see
   * `RunItemResult.error` for the row-level version, which fires before any assertion even runs).
   * Always implies `passed: false` (an errored check still counts as a fail for rollups — it just
   * gets its own reason/visual treatment and its own bucket in the panel's outcome filter), and is
   * mutually exclusive with `na` (an assertion is either skipped or attempted, never both).
   */
  errored?: boolean;
  /**
   * Present only when this score belongs to a composite/grouped assertion (`Assertion.children`
   * set) — each child's own score, in the same shape and keyed the same way (`assertionId`) as a
   * normal top-level score, so the UI can render the breakdown behind the group's aggregate
   * pass/fail without those children ever being separate top-level rows in `RunItemResult.scores`
   * (which would double-count them in every rollup).
   */
  childScores?: AssertionScore[];
}

/** Prompt/completion/total token counts for one generation call — same shape as the Playground's `PlaygroundUsage` in `api.ts`. */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface RunItemResult {
  datasetItemId: string;
  output: string;
  scores: AssertionScore[];
  /** Short, filterable tags a reviewer attaches while triaging (e.g. "hallucination", "needs fix") — editable inline in the table and the side panel; the only annotation mechanism at this level (unlike `DatasetItem`, which also has a persistent freeform `note`). */
  labels?: string[];
  /** Wall-clock time of the generation call that produced `output` — excludes judge grading calls. */
  latencyMs?: number;
  /** Estimated cost (USD) of the generation call that produced `output`, from token usage × model pricing. */
  costUsd?: number;
  /** Token counts behind `costUsd` — same "directionally correct, not billing-grade" convention. */
  tokenUsage?: TokenUsage;
  /**
   * When set, the generation call itself failed (timeout, provider error, etc.) before any
   * assertion could run — a third row status alongside pass/fail, matching Promptfoo's own
   * Pass/Fail/Error split. `scores` is empty and `output` is typically blank when this is set.
   */
  error?: string;
}

/** One compared prompt/target's full result set inside a comparison Run — see `RunGroup.comparison`. */
export interface RunVariant {
  /** Stable within the Run — not globally unique like `RunGroup.id`. */
  id: string;
  /** Human-readable column header, e.g. "Prompt 3643 · v23612" — real promptId/versionId when known, otherwise a plain name. */
  label: string;
  /** The Spec's `TargetVersion.id` this variant evaluated, when it corresponds to a real mirrored Prompt version. */
  targetId?: string;
  results: RunItemResult[];
  passRate: number;
}

/**
 * "What to look at first, and how to improve" for one Run — the heuristic version (`engine.ts`'s
 * `suggestRunInsightsHeuristic`) is always free/instant and computed client-side; the optional
 * LLM version (`/api/suggest-review-insights`) is a deeper, opt-in pass a user can request.
 */
export interface RunInsights {
  reviewFirst: { datasetItemId: string; reason: string }[];
  improvements: string[];
}

export interface RunGroup {
  id: string;
  createdAt: number;
  mode: GenerationMode;
  results: RunItemResult[];
  passRate: number;
  /**
   * `"sample"` when this run only scored a chosen subset of the Dataset (random or hand-picked
   * rows) rather than every row — useful for a quick check before running a huge dataset in full.
   */
  scope: "full" | "sample";
  /**
   * The Spec's `TargetVersion.id` that was active when this Run happened — i.e. which exact
   * mirrored Prompt version it evaluated. Stamped once at run time and never updated afterward,
   * so a Run keeps pointing at the version it actually ran against even after the Spec's Target
   * changes later. See `versionIdForTarget`/`mirrorPromptIdForSpec` in `promptFactory.ts` for how
   * this maps to the corresponding Prompt/PromptVersion row. Undefined on legacy runs that
   * predate this field — falls back to the Spec's current Target in the UI.
   */
  targetId?: string;
  /**
   * `MockUser.id` of whoever triggered this Run — stamped once at run time by `finalizeRun`,
   * standing in for a real "run as" identity so the Eval runs list's Author column has something
   * real to show (not invented per-row). Undefined on legacy/seed runs that predate this field —
   * the UI falls back to the Spec's owner in that case, same convention as `targetId`.
   */
  ranByUserId?: string;
  /**
   * Present only when this Run compared 2+ prompts/targets against the exact same dataset and
   * assertions in one go (e.g. "new version vs. existing baseline") — Promptfoo-style multi-provider
   * comparison, triggered as a single eval, not assembled after the fact from separate Runs.
   * `variants[0]` always mirrors this Run's own top-level `results`/`targetId`/`passRate` (kept in
   * sync at creation time) so every existing single-Run view keeps working unchanged; the
   * comparison table/charts read `variants` directly instead.
   */
  comparison?: { variants: RunVariant[] };
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
 * Forward-looking adoption/usage counters for a Spec — mocked today so the concept can be
 * demoed, but in production these would be sourced from real telemetry (Dynatrace tracing
 * LiteLLM calls), not authored by hand.
 */
export interface SpecUsageStats {
  /** Rolling window these counters cover, in hours (mocked as a fixed 24h window today). */
  windowHours: number;
  /** How many times a Prompt version generated from this Spec has been fetched from AI Studio, within the window. */
  promptFetches: number;
  /**
   * How many times that Prompt was actually executed on Production via a LiteLLM call, within
   * the window. NOT a subset of `promptFetches` — a single fetch is typically cached by the
   * caller and reused across many executions, so `productionExecutions` is normally >= (often
   * much greater than) `promptFetches`, never the other way around.
   */
  productionExecutions: number;
}

/**
 * Tracks, for one Generate-able artifact (Prompt/Assertions/Dataset), when it was last produced
 * by Generate vs. last hand-edited outside of Generate — the raw data `specFactory.ts`'s
 * `getArtifactStaleness` uses to warn "this may no longer match the Spec brief".
 */
export interface ArtifactSyncInfo {
  /** When this artifact was last (re)generated from the Spec's brief. Undefined = never generated. */
  generatedAt?: number;
  /** When this artifact was last hand-edited outside Generate. Cleared back to undefined by the next Generate. */
  manualEditAt?: number;
}

/**
 * Divergence-tracking between a Spec's brief (goal/context/contracts/requirements/examples) and
 * the artifacts generated from it. See `specFactory.ts`'s `getArtifactStaleness`/`isSpecStale`.
 */
export interface SpecSyncState {
  /** Bumped whenever the Spec's brief changes — see `markBriefEdited` in `specFactory.ts`. */
  briefUpdatedAt: number;
  prompt: ArtifactSyncInfo;
  assertions: ArtifactSyncInfo;
  dataset: ArtifactSyncInfo;
}

export interface SpecProject {
  id: string;
  name: string;
  goal: string;
  /** Background beyond the goal — who reads the output, where it's surfaced downstream, etc. */
  context: string;
  inputFields: IOField[];
  outputFields: IOField[];
  outputMode: OutputMode;
  /** `outputMode: "tool_call"` only — the name of the forced function/tool (e.g. `"your_func_1"`). */
  outputToolName?: string;
  /** Flat list — see `Requirement`. Replaces the old guardrails/criteria split. */
  requirements: Requirement[];
  openQuestions: OpenQuestion[];
  examples: Example[];

  /**
   * `"published"` is no longer a status this struct carries directly — a Spec counts as published
   * iff its current `target` (i.e. its mirrored Prompt's active version) is published. See
   * `isSpecPublished` in `specFactory.ts`. Assertions/Dataset/Eval have no publish state of their
   * own; "published" now lives only at the Prompt (Target) and Spec level.
   */
  target: TargetVersion | null;
  /** Prior active Targets, most recent first — pushed here right before `target` is overwritten. */
  promptHistory: TargetVersion[];
  assertions: Assertion[];
  judge: JudgePolicy | null;
  dataset: DatasetItem[];
  /** Fraction (0-1) of dataset rows an assertion must pass by default — see `Assertion.passThreshold`. */
  defaultPassThreshold: number;
  /** Id of the LibraryDataset the whole dataset was last loaded from, if any. Not a live link. */
  datasetLibraryOrigin?: string;

  runs: RunGroup[];
  comments: Comment[];
  verdict: Verdict;
  released: boolean;

  /** Whether the most recent Generate actually called a live LLM or fell back to simulation. */
  lastGenerationMode?: GenerationMode;

  ownerId: string;
  /** Id of the user who made the most recent change — drives the "Last updated by" column. */
  updatedByUserId: string;
  visibility: LibraryVisibility;
  /** Explicit per-person role grants, on top of the owner and the private/org default. */
  access: AccessGrant[];

  /**
   * Exact product/feature surface this Spec is applied against (e.g. "CC Headline", "Pearl
   * Intake Bot") — free text, mocked today. See `SpecUsageStats` for the adoption counters.
   */
  appliedFeature?: string;
  /** Mocked adoption/usage counters — see `SpecUsageStats`. */
  usageStats?: SpecUsageStats;

  /** Set when this Spec was forked as a new version of another Spec. */
  forkedFromId?: string;
  forkedFromName?: string;

  /**
   * The real numeric project id from the production Prompt Management system that this Spec's
   * mirrored Prompt corresponds to — distinct from this Spec's own `id`, which is only an AI
   * Studio-internal key. Undefined until the Spec's Prompt has actually been synced there
   * (brand-new/never-published Specs have no id yet). See `TargetVersion.psVersionId` for the
   * matching per-version id.
   */
  psProjectId?: number;
  /**
   * A human-readable Prompt name to show ahead of `name` when identifying a Run (e.g. in the Eval
   * runs list / Run detail header) — distinct from `name`, which for some Specs (e.g. the
   * CSV-imported Scenario demos) is really an eval-scenario description, not the underlying
   * Prompt's own name. NOTE FOR ENGINEER: in production this identity is really "Prompt +
   * specific published Version" (see `psProjectId` + `TargetVersion.psVersionId`), not just "a
   * Prompt" — `describeRunPromptIdentity` in `promptFactory.ts` renders both together for exactly
   * that reason. Undefined falls back to the mirrored Prompt's `name` (which today always equals
   * `name` — see `mirrorPromptFromSpec`).
   */
  promptDisplayName?: string;

  /** Undefined on legacy/seed data — treated as "no divergence info yet" (no staleness warnings). */
  syncState?: SpecSyncState;

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
  /**
   * Field/variable names for a dataset created directly in the library (no Spec/prompt to infer
   * them from). Undefined on Spec-saved datasets — their fields are derived from `items` instead.
   */
  variableNames?: string[];
}

export type LibraryKind = "assertions" | "datasets";

export interface Library {
  assertions: LibraryAssertion[];
  datasets: LibraryDataset[];
}
