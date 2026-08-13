import type { CodeCheckMode } from "./types";

/** Which extra `CodeCheck` fields a given mode reads from, beyond `mode` itself. */
export interface AssertionModeSpec {
  mode: CodeCheckMode;
  label: string;
  group: "Text match" | "Structured data" | "Similarity" | "Cost & latency";
  /** Short helper shown under the mode picker. */
  hint: string;
  needsValue: boolean;
  valuePlaceholder?: string;
  /** Comma-separated list, so the value field should hint at multiple entries. */
  valueIsList?: boolean;
  needsReference: boolean;
  referencePlaceholder?: string;
  needsThreshold: boolean;
  thresholdLabel?: string;
  thresholdDefault?: number;
}

/**
 * The deterministic tier's built-in check catalog — modeled on promptfoo's non-model-graded
 * assertion types (`contains`, `equals`, `regex`, `levenshtein`, `rouge-n`, `cost`, `latency`, …)
 * so "deterministic" means "the same built-in library promptfoo ships", not a bespoke set.
 */
export const ASSERTION_MODE_CATALOG: AssertionModeSpec[] = [
  {
    mode: "equals",
    label: "Equals",
    group: "Text match",
    hint: "Output must exactly match this string (trimmed).",
    needsValue: true,
    valuePlaceholder: "Exact expected output",
    needsReference: false,
    needsThreshold: false,
  },
  {
    mode: "contains",
    label: "Contains",
    group: "Text match",
    hint: "Output must contain this phrase (case-sensitive).",
    needsValue: true,
    valuePlaceholder: "Phrase that must appear",
    needsReference: false,
    needsThreshold: false,
  },
  {
    mode: "icontains",
    label: "Contains (case-insensitive)",
    group: "Text match",
    hint: "Output must contain this phrase, ignoring case.",
    needsValue: true,
    valuePlaceholder: "Phrase that must appear",
    needsReference: false,
    needsThreshold: false,
  },
  {
    mode: "excludes",
    label: "Excludes",
    group: "Text match",
    hint: "Output must NOT contain this phrase.",
    needsValue: true,
    valuePlaceholder: "Phrase that must not appear",
    needsReference: false,
    needsThreshold: false,
  },
  {
    mode: "contains_all",
    label: "Contains all of",
    group: "Text match",
    hint: "Output must contain every one of these phrases.",
    needsValue: true,
    valuePlaceholder: "phrase one, phrase two, …",
    valueIsList: true,
    needsReference: false,
    needsThreshold: false,
  },
  {
    mode: "contains_any",
    label: "Contains any of",
    group: "Text match",
    hint: "Output must contain at least one of these phrases.",
    needsValue: true,
    valuePlaceholder: "phrase one, phrase two, …",
    valueIsList: true,
    needsReference: false,
    needsThreshold: false,
  },
  {
    mode: "icontains_all",
    label: "Contains all of (case-insensitive)",
    group: "Text match",
    hint: "Output must contain every one of these phrases, ignoring case.",
    needsValue: true,
    valuePlaceholder: "phrase one, phrase two, …",
    valueIsList: true,
    needsReference: false,
    needsThreshold: false,
  },
  {
    mode: "icontains_any",
    label: "Contains any of (case-insensitive)",
    group: "Text match",
    hint: "Output must contain at least one of these phrases, ignoring case.",
    needsValue: true,
    valuePlaceholder: "phrase one, phrase two, …",
    valueIsList: true,
    needsReference: false,
    needsThreshold: false,
  },
  {
    mode: "starts_with",
    label: "Starts with",
    group: "Text match",
    hint: "Output must start with this phrase.",
    needsValue: true,
    valuePlaceholder: "Required prefix",
    needsReference: false,
    needsThreshold: false,
  },
  {
    mode: "regex_match",
    label: "Matches regex",
    group: "Text match",
    hint: "Output must match this regular expression.",
    needsValue: true,
    valuePlaceholder: "^[^?]*\\?[^?]*$",
    needsReference: false,
    needsThreshold: false,
  },
  {
    mode: "regex_excludes",
    label: "Does not match regex",
    group: "Text match",
    hint: "Output must NOT match this regular expression.",
    needsValue: true,
    valuePlaceholder: "\\b(bad|banned)\\b",
    needsReference: false,
    needsThreshold: false,
  },
  {
    mode: "enum",
    label: "Exact enum",
    group: "Structured data",
    hint: "Output must be exactly one of these values.",
    needsValue: true,
    valuePlaceholder: "yes, no",
    valueIsList: true,
    needsReference: false,
    needsThreshold: false,
  },
  {
    mode: "valid_json",
    label: "Is valid JSON",
    group: "Structured data",
    hint: "Output must parse as valid JSON.",
    needsValue: false,
    needsReference: false,
    needsThreshold: false,
  },
  {
    mode: "contains_json",
    label: "Contains JSON",
    group: "Structured data",
    hint: "Output must contain a valid JSON object or array somewhere in it.",
    needsValue: false,
    needsReference: false,
    needsThreshold: false,
  },
  {
    mode: "is_xml",
    label: "Is valid XML",
    group: "Structured data",
    hint: "Output must look like a single well-formed XML document.",
    needsValue: false,
    needsReference: false,
    needsThreshold: false,
  },
  {
    mode: "contains_xml",
    label: "Contains XML",
    group: "Structured data",
    hint: "Output must contain at least one XML tag pair.",
    needsValue: false,
    needsReference: false,
    needsThreshold: false,
  },
  {
    mode: "contains_sql",
    label: "Contains SQL",
    group: "Structured data",
    hint: "Output must contain something that looks like a SQL statement (heuristic keyword match).",
    needsValue: false,
    needsReference: false,
    needsThreshold: false,
  },
  {
    mode: "levenshtein",
    label: "Levenshtein distance",
    group: "Similarity",
    hint: "Output must be within a max edit distance of the reference text.",
    needsValue: false,
    needsReference: true,
    referencePlaceholder: "Reference text to compare against",
    needsThreshold: true,
    thresholdLabel: "Max edit distance",
    thresholdDefault: 10,
  },
  {
    mode: "rouge_n",
    label: "ROUGE-N overlap",
    group: "Similarity",
    hint: "Output must have at least this much word overlap (F1) with the reference text.",
    needsValue: false,
    needsReference: true,
    referencePlaceholder: "Reference text to compare against",
    needsThreshold: true,
    thresholdLabel: "Min overlap score (0–1)",
    thresholdDefault: 0.5,
  },
  {
    mode: "latency",
    label: "Max latency",
    group: "Cost & latency",
    hint: "Generation must complete within this many milliseconds. Gap: this prototype doesn't track per-run latency yet, so this always passes.",
    needsValue: false,
    needsReference: false,
    needsThreshold: true,
    thresholdLabel: "Max latency (ms)",
    thresholdDefault: 3000,
  },
  {
    mode: "cost",
    label: "Max cost",
    group: "Cost & latency",
    hint: "Generation must cost less than this many USD. Gap: this prototype doesn't track per-run cost yet, so this always passes.",
    needsValue: false,
    needsReference: false,
    needsThreshold: true,
    thresholdLabel: "Max cost (USD)",
    thresholdDefault: 0.01,
  },
];

const CATALOG_BY_MODE = new Map(ASSERTION_MODE_CATALOG.map((spec) => [spec.mode, spec]));

export function getModeSpec(mode: CodeCheckMode): AssertionModeSpec {
  return CATALOG_BY_MODE.get(mode) ?? ASSERTION_MODE_CATALOG[0];
}

export function modeLabel(mode: CodeCheckMode): string {
  return getModeSpec(mode).label;
}

export const ASSERTION_MODE_GROUPS = Array.from(new Set(ASSERTION_MODE_CATALOG.map((s) => s.group)));
