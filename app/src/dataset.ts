import type { DatasetItem, DatasetItemSource, LibraryDataset, PromptMessage } from "./types";
import { extractVariableNames } from "./promptTemplate";
import { newId } from "./utils/id";

/** Shared display strings/tones for `DatasetItemSource`, so the "synthetic vs. manual" significator looks and reads the same everywhere it appears (Dataset table, Results table, both detail panels, filters) — same two-way split Prompt Studio uses (an AI-generated sparkle vs. everything else). */
export const DATASET_SOURCE_LABEL: Record<DatasetItemSource, string> = {
  synthetic: "Synthetic",
  manual: "Manual",
};

export const DATASET_SOURCE_TONE: Record<DatasetItemSource, "neutral" | "info" | "accent"> = {
  synthetic: "info",
  manual: "neutral",
};

/**
 * Which named `{variable}` values a Dataset row should collect, derived from the current Target's
 * structured messages. Falls back to the single legacy `input` variable when the Target has no
 * messages yet (or none of them use any placeholders) — so a Spec that's never touched the
 * Playground still gets the familiar single-field row editor.
 */
export function datasetVariableNames(messages?: PromptMessage[] | null): string[] {
  const names = messages && messages.length > 0 ? extractVariableNames(messages) : [];
  return names.length > 0 ? names : ["input"];
}

/**
 * Field/variable names for a standalone library Dataset, which has no Target/prompt to derive
 * them from. Prefers the names chosen at creation (`variableNames`); falls back to whatever keys
 * the first row actually has, for datasets saved from a Spec before this field existed.
 */
export function libraryDatasetVariableNames(entry: Pick<LibraryDataset, "variableNames" | "items">): string[] {
  if (entry.variableNames && entry.variableNames.length > 0) return entry.variableNames;
  const first = entry.items[0];
  if (first?.variables && Object.keys(first.variables).length > 0) return Object.keys(first.variables);
  return ["input"];
}

/** Every value for `names` on one row, falling back to the legacy `input` field for `"input"`. */
export function resolveDatasetItemValues(item: DatasetItem, names: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of names) {
    values[name] = item.variables?.[name] ?? (name === "input" ? item.input : "");
  }
  return values;
}

/** Full substitution map for actually running a row — always has `input`, plus anything else stored. */
export function datasetItemSubstitutionValues(item: DatasetItem): Record<string, string> {
  return { input: item.input, ...item.variables };
}

/** The row's "primary" variable name — `input` if the Target still uses it, else the first one. */
function primaryVariableName(names: string[]): string {
  return names.includes("input") ? "input" : (names[0] ?? "input");
}

export function buildDatasetItem(
  values: Record<string, string>,
  names: string[],
  source: DatasetItemSource,
  expectedOutput?: string,
): DatasetItem {
  const input = values[primaryVariableName(names)] ?? "";
  const now = Date.now();
  return {
    id: newId("item"),
    input,
    source,
    expectedOutput: expectedOutput?.trim() ? expectedOutput.trim() : undefined,
    variables: { ...values },
    createdAt: now,
    updatedAt: now,
  };
}

/** Returns a copy of `item` with one variable's value changed, keeping the legacy `input` field in sync. */
export function withUpdatedVariable(item: DatasetItem, names: string[], name: string, value: string): DatasetItem {
  const values = { ...resolveDatasetItemValues(item, names), [name]: value };
  const primary = primaryVariableName(names);
  return { ...item, input: values[primary] ?? item.input, variables: values, updatedAt: Date.now() };
}

/** Returns a copy of `item` with every variable replaced at once (e.g. from the panel's JSON editor). */
export function withUpdatedVariables(item: DatasetItem, names: string[], values: Record<string, string>): DatasetItem {
  const primary = primaryVariableName(names);
  return { ...item, input: values[primary] ?? item.input, variables: { ...values }, updatedAt: Date.now() };
}

/** Returns a copy of `item` with its reference/expected output replaced. */
export function withUpdatedExpectedOutput(item: DatasetItem, expectedOutput: string): DatasetItem {
  return {
    ...item,
    expectedOutput: expectedOutput.trim() ? expectedOutput : undefined,
    updatedAt: Date.now(),
  };
}

/**
 * Returns a copy of `item` with its reviewer note/labels replaced — deliberately does NOT bump
 * `updatedAt` (unlike content edits above), since annotating a row isn't "editing" it in the
 * sense that field means elsewhere (surfaced as a Modified At column/sort).
 */
export function withUpdatedNote(item: DatasetItem, note: string): DatasetItem {
  return { ...item, note: note.trim() ? note : undefined };
}

export function withUpdatedLabels(item: DatasetItem, labels: string[]): DatasetItem {
  return { ...item, labels };
}

/**
 * Best-effort formatting for a piece of free-text input/output data, since it can be genuinely
 * anything (a plain sentence, a JSON blob, a whole chat transcript…) — there's no one right way
 * to render it. The one safe, unambiguous win: if it happens to parse as JSON, pretty-print it
 * (2-space indent) instead of showing it as one unreadable line. Anything else is returned as-is.
 */
export function tryPrettyPrintText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) return text;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return text;
  }
}

/** Every distinct label used anywhere in this Spec's dataset rows — powers the label filter/autocomplete for dataset-level annotation. */
export function collectAllDatasetLabels(items: DatasetItem[]): string[] {
  const set = new Set<string>();
  for (const item of items) {
    for (const l of item.labels ?? []) set.add(l);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** One-line, human-readable summary of a row — every variable when there's more than one, else just the value. */
export function datasetItemLabel(item: DatasetItem, names: string[]): string {
  if (names.length <= 1) return resolveDatasetItemValues(item, names)[names[0]] || item.input;
  const values = resolveDatasetItemValues(item, names);
  return names.map((n) => `${n}: ${values[n] || "—"}`).join("  ·  ");
}

/** Picks `count` distinct row ids at random from `ids` (or all of them if `count` >= the total). */
export function pickRandomIds(ids: string[], count: number): string[] {
  const shuffled = [...ids];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.max(0, Math.min(count, shuffled.length)));
}

/**
 * One-line preview of a row's inputs for a compact table cell — every variable inlined as
 * `name: value` (matching `datasetItemLabel`) when there's more than one, else just the raw value.
 * Newlines are collapsed so long, multi-line pasted text doesn't blow out row height in compact mode.
 */
export function datasetItemInputsPreview(item: DatasetItem, names: string[]): string {
  return datasetItemLabel(item, names).replace(/\s+/g, " ").trim();
}

/** Pretty-printed JSON of every variable on this row — the "JSON" side of the Fields/JSON toggle. */
export function stringifyVariables(item: DatasetItem, names: string[]): string {
  return JSON.stringify(resolveDatasetItemValues(item, names), null, 2);
}

/**
 * Parses the JSON text from the panel's JSON editor back into a flat name→string values map.
 * Non-string values are stringified rather than rejected, so pasting numbers/booleans/nested
 * JSON still round-trips instead of hard-erroring — "something else" formats degrade gracefully
 * rather than being blocked outright. Throws only when the text isn't valid JSON or isn't an object.
 */
export function parseVariablesJson(json: string, names: string[]): Record<string, string> {
  const parsed = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object of variable name → value.");
  }
  const values: Record<string, string> = {};
  for (const name of names) {
    const raw = (parsed as Record<string, unknown>)[name];
    values[name] = raw === undefined || raw === null ? "" : typeof raw === "string" ? raw : JSON.stringify(raw);
  }
  return values;
}
