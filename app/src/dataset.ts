import type { DatasetItem, DatasetItemSource, PromptMessage } from "./types";
import { extractVariableNames } from "./promptTemplate";
import { newId } from "./utils/id";

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
  return {
    id: newId("item"),
    input,
    source,
    expectedOutput: expectedOutput?.trim() ? expectedOutput.trim() : undefined,
    variables: { ...values },
  };
}

/** Returns a copy of `item` with one variable's value changed, keeping the legacy `input` field in sync. */
export function withUpdatedVariable(item: DatasetItem, names: string[], name: string, value: string): DatasetItem {
  const values = { ...resolveDatasetItemValues(item, names), [name]: value };
  const primary = primaryVariableName(names);
  return { ...item, input: values[primary] ?? item.input, variables: values };
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
