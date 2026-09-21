import type {
  Assertion,
  AssertionScore,
  AssertionTier,
  CodeCheck,
  DatasetItem,
  RunGroup,
  RunInsights,
  RunItemResult,
  SpecProject,
} from "./types";
import { newId } from "./utils/id";
import { seededRandom } from "./utils/random";
import { estimateCostUsd, estimateTokens } from "./pricing";
import { datasetItemLabel, datasetVariableNames } from "./dataset";

export const DEFAULT_TARGET_MODEL = "gpt-4o-mini";
export const DEFAULT_TEMPERATURE = 0.7;

function extractPhrase(text: string, after: RegExp): string | null {
  const m = text.match(after);
  if (!m || m.index === undefined) return null;
  let rest = text.slice(m.index + m[0].length).trim();
  rest = rest.replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, "");
  rest = rest.replace(/[.!?]+$/g, "");
  if (!rest) return null;
  if (rest.length > 42) rest = rest.slice(0, 42).trim();
  return rest;
}

// The verb after the trigger phrase is mandatory — "never robotic" or "must not return false
// when X" should NOT be treated as "the output must literally avoid the word 'robotic'/'false'".
const EXCLUDE_TRIGGER =
  /(must not|should not|never|must avoid|should avoid|do not|don't|cannot)\s+(?:mention|include|contain|cite|say|reference|return)/i;
const INCLUDE_TRIGGER =
  /(must|should)(?: always)?\s+(?:mention|include|contain|cite|say|reference)/i;
// Require a digit before "sentence(s)" (e.g. "2-4 sentences") so a criterion merely about
// *content* ("...in the first sentence") doesn't false-positive on a formatting check.
const STRUCTURAL = /\bjson\b|\bschema\b|\bbulleted?\b|\bword limit\b|\bcharacter limit\b|\d+[-–\s]*\d*\s*sentences?\b|\bformat\b/i;

/**
 * A phrase extracted from a criterion is only trustworthy as a literal contains/excludes check
 * if it's short and doesn't read like a clause of its own (a whole sub-sentence describing a
 * *scenario*, not a literal string that would actually appear in the output). Longer or
 * clause-like extractions are safer left to a judge than turned into a bogus literal match.
 */
function isLiteralPhrase(phrase: string | null): phrase is string {
  if (!phrase) return false;
  const words = phrase.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;
  if (/\b(when|unless|if|because|other than|so that|early on|anything)\b/i.test(phrase)) return false;
  return true;
}

/** Cheapest-tier-first classifier — mirrors the cost hierarchy from the redesign docs. */
export function classifyRequirementStatement(text: string): {
  tier: AssertionTier;
  check?: CodeCheck;
  rubric?: string;
  description: string;
} {
  if (EXCLUDE_TRIGGER.test(text)) {
    const phrase = extractPhrase(text, EXCLUDE_TRIGGER);
    if (isLiteralPhrase(phrase)) {
      return {
        tier: "deterministic",
        check: { mode: "excludes", value: phrase },
        description: `Output must NOT contain "${phrase}"`,
      };
    }
  }
  if (INCLUDE_TRIGGER.test(text)) {
    const phrase = extractPhrase(text, INCLUDE_TRIGGER);
    if (isLiteralPhrase(phrase)) {
      return {
        tier: "deterministic",
        check: { mode: "contains", value: phrase },
        description: `Output must contain "${phrase}"`,
      };
    }
  }
  if (STRUCTURAL.test(text)) {
    return {
      tier: "deterministic",
      check: { mode: "contains", value: "" },
      description: `Structural check — ${text}`,
    };
  }
  return {
    tier: "rubric_grading",
    rubric: `Judge whether the output satisfies: "${text}". Answer pass or fail.`,
    description: text,
  };
}

function fieldLine(f: { name: string; type: string; required: boolean; description: string }): string {
  return `- ${f.name} (${f.type}${f.required ? ", required" : ", optional"})${f.description ? `: ${f.description}` : ""}`;
}

/**
 * Derives structural assertions directly from the Output contract's typed shape/mode — e.g. a
 * single boolean field gets an exact enum check, `json_schema` mode gets a valid-JSON check.
 * `tool_call` mode gets neither: the tool's own parameter schema already enforces the shape, so
 * there's nothing left for a text-level check to usefully add. These are the checks that can't be
 * safely skipped: they gate whether the output is even usable downstream.
 */
export function deriveStructuralAssertions(spec: SpecProject): Assertion[] {
  const out: Assertion[] = [];
  if (spec.outputMode === "tool_call") return out;

  if (spec.outputMode === "json_schema" && spec.outputFields.length > 0) {
    out.push({
      id: newId("assert"),
      sourceRequirementId: null,
      tier: "deterministic",
      description: "Output must be valid, parseable JSON",
      check: { mode: "valid_json", value: "" },
    });
  }

  // A single boolean field, regardless of mode, is the "respond with exactly true/false" case —
  // narrow enough to check literally rather than leaving it to a judge.
  if (spec.outputFields.length === 1 && spec.outputFields[0].type === "boolean") {
    out.push({
      id: newId("assert"),
      sourceRequirementId: null,
      tier: "deterministic",
      description: "Output must be exactly one of: true / false — nothing else",
      check: { mode: "enum", value: "true,false" },
    });
  }

  return out;
}

export function buildPromptContent(spec: SpecProject): string {
  const lines: string[] = [];
  lines.push(`You are assisting with: ${spec.goal || "(no goal set yet)"}`);
  if (spec.context) lines.push(`\nBackground: ${spec.context}`);
  if (spec.inputFields.length) {
    lines.push(`\nYou will receive:`);
    spec.inputFields.forEach((f) => lines.push(fieldLine(f)));
  }
  if (spec.outputFields.length) {
    const modeNote =
      spec.outputMode === "tool_call"
        ? `by calling the ${spec.outputToolName || "output"} tool with`
        : spec.outputMode === "json_schema"
          ? "in JSON, with"
          : "as plain text representing";
    lines.push(`\nRespond ${modeNote}:`);
    spec.outputFields.forEach((f) => lines.push(fieldLine(f)));
  }
  if (spec.requirements.length) {
    lines.push(`\nYour response must satisfy:`);
    spec.requirements.forEach((r) => lines.push(`- ${r.name}: ${r.statement}`));
  }
  return lines.join("\n");
}

const SCENARIOS = [
  "a first-time user with almost no context",
  "an edge case where required info is missing",
  "a frustrated, impatient user",
  "a very long, rambling input",
  "a technically precise, expert-level request",
];

export function generateSyntheticItems(spec: SpecProject, count: number): DatasetItem[] {
  const out: DatasetItem[] = [];
  for (let i = 0; i < count; i++) {
    const topic = SCENARIOS[i % SCENARIOS.length];
    out.push({
      id: newId("item"),
      input: `${spec.goal || "Handle this request"} — scenario: ${topic}.`,
      source: "synthetic",
    });
  }
  return out;
}

/**
 * Classification + structural-check derivation is always local/deterministic (cheap, free,
 * no LLM round trip) — this is the part of a "generate" the LLM-backed path reuses as-is,
 * only the prompt wording and dataset rows go through the model.
 */
export function classifyAssertionsFor(spec: SpecProject): Assertion[] {
  const fromRequirements: Assertion[] = spec.requirements.map((r) => {
    const cls = classifyRequirementStatement(r.statement);
    return {
      id: newId("assert"),
      sourceRequirementId: r.id,
      tier: cls.tier,
      description: cls.description,
      check: cls.check,
      rubric: cls.rubric,
    };
  });
  return [...deriveStructuralAssertions(spec), ...fromRequirements];
}

function violationRate(a: Assertion): number {
  if (a.children?.length) return a.children.reduce((sum, c) => sum + violationRate(c), 0) / a.children.length;
  if (a.tier === "deterministic") {
    if (!a.check || (a.check.mode === "contains" && a.check.value === "")) return 0.1;
    return 0.16;
  }
  if (a.tier === "custom_code") return 0.14;
  return 0.2;
}

function simulateOutput(
  input: string,
  scored: { assertion: Assertion; passed: boolean }[],
): string {
  const openers = [
    `Here's a response to: "${input}"`,
    `Thanks — regarding "${input}":`,
    `On "${input}", here's what I'd say:`,
  ];
  const seed = seededRandom(input);
  const opener = openers[Math.floor(seed * 1000) % openers.length];
  const sentences: string[] = [opener];

  scored.forEach(({ assertion, passed }) => {
    if (assertion.tier === "deterministic" && assertion.check?.value) {
      const { mode, value } = assertion.check;
      if (mode === "contains" || mode === "icontains" || mode === "equals" || mode === "starts_with") {
        sentences.push(passed ? `${value}.` : `(left that part out this time)`);
      } else if (mode === "excludes") {
        sentences.push(passed ? `` : `Oh — and by the way, ${value}.`);
      }
    } else if (assertion.tier === "rubric_grading" && !passed) {
      sentences.push("(this part came out a bit off)");
    }
  });

  return sentences.filter(Boolean).join(" ");
}

function splitList(value: string): string[] {
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

/** Classic Levenshtein (edit) distance between two strings. */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/** Approximate ROUGE-1 F1 — unigram word overlap between output and reference. Good enough as a prototype similarity signal. */
function rougeNScore(output: string, reference: string): number {
  const tokenize = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const outTokens = tokenize(output);
  const refTokens = tokenize(reference);
  if (outTokens.length === 0 || refTokens.length === 0) return 0;
  const refCounts = new Map<string, number>();
  for (const t of refTokens) refCounts.set(t, (refCounts.get(t) ?? 0) + 1);
  let overlap = 0;
  const remaining = new Map(refCounts);
  for (const t of outTokens) {
    const left = remaining.get(t) ?? 0;
    if (left > 0) {
      overlap += 1;
      remaining.set(t, left - 1);
    }
  }
  const precision = overlap / outTokens.length;
  const recall = overlap / refTokens.length;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

const SQL_KEYWORDS = /\b(select|insert\s+into|update|delete\s+from|create\s+table|drop\s+table|where|join)\b/i;
const XML_TAG_PAIR = /<([a-zA-Z][\w:-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1>/;

/** Real, deterministic scoring of a `deterministic`-tier assertion against an actual (or simulated) output string. */
export function scoreCodeAssertion(check: CodeCheck, output: string): { passed: boolean; reason: string } {
  const text = output ?? "";
  const lower = text.toLowerCase();
  switch (check.mode) {
    case "equals": {
      const passed = text.trim() === check.value.trim();
      return { passed, reason: passed ? `Output equals "${check.value}".` : `Output does not equal "${check.value}".` };
    }
    case "not_equals": {
      const passed = text.trim() !== check.value.trim();
      return { passed, reason: passed ? `Output correctly differs from "${check.value}".` : `Output equals "${check.value}", which it shouldn't.` };
    }
    case "contains": {
      if (!check.value) return { passed: true, reason: "Structural check passed." };
      const passed = text.includes(check.value);
      return {
        passed,
        reason: passed ? `Found "${check.value}" in the output.` : `Missing "${check.value}" in the output.`,
      };
    }
    case "icontains": {
      const passed = lower.includes(check.value.toLowerCase());
      return {
        passed,
        reason: passed ? `Found "${check.value}" (case-insensitive).` : `Missing "${check.value}" (case-insensitive).`,
      };
    }
    case "excludes": {
      const passed = !text.includes(check.value);
      return {
        passed,
        reason: passed
          ? `Correctly avoided "${check.value}".`
          : `Output contains "${check.value}", which it shouldn't.`,
      };
    }
    case "not_contains_any": {
      const items = splitList(check.value);
      const found = items.filter((it) => text.includes(it));
      return {
        passed: found.length === 0,
        reason: found.length === 0 ? "Contains none of the disallowed phrases." : `Contains disallowed phrase(s): ${found.join(", ")}.`,
      };
    }
    case "not_icontains_any": {
      const items = splitList(check.value).map((v) => v.toLowerCase());
      const found = items.filter((it) => lower.includes(it));
      return {
        passed: found.length === 0,
        reason: found.length === 0 ? "Contains none of the disallowed phrases (case-insensitive)." : `Contains disallowed phrase(s): ${found.join(", ")}.`,
      };
    }
    case "contains_all": {
      const items = splitList(check.value);
      const missing = items.filter((it) => !text.includes(it));
      return {
        passed: missing.length === 0,
        reason: missing.length === 0 ? "Contains all required phrases." : `Missing: ${missing.join(", ")}.`,
      };
    }
    case "contains_any": {
      const items = splitList(check.value);
      const passed = items.some((it) => text.includes(it));
      return { passed, reason: passed ? "Contains at least one required phrase." : `Missing all of: ${items.join(", ")}.` };
    }
    case "icontains_all": {
      const items = splitList(check.value).map((v) => v.toLowerCase());
      const missing = items.filter((it) => !lower.includes(it));
      return {
        passed: missing.length === 0,
        reason: missing.length === 0 ? "Contains all required phrases (case-insensitive)." : `Missing: ${missing.join(", ")}.`,
      };
    }
    case "icontains_any": {
      const items = splitList(check.value).map((v) => v.toLowerCase());
      const passed = items.some((it) => lower.includes(it));
      return { passed, reason: passed ? "Contains at least one required phrase (case-insensitive)." : `Missing all of: ${items.join(", ")}.` };
    }
    case "starts_with": {
      const passed = text.startsWith(check.value);
      return { passed, reason: passed ? `Starts with "${check.value}".` : `Does not start with "${check.value}".` };
    }
    case "enum": {
      const allowed = check.value.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
      const normalized = text.trim().toLowerCase();
      const passed = allowed.includes(normalized);
      return {
        passed,
        reason: passed
          ? `Output was exactly "${normalized}", one of the allowed values.`
          : `Output was "${text.trim().slice(0, 60)}", not one of: ${allowed.join(" / ")}.`,
      };
    }
    case "valid_json": {
      try {
        const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        JSON.parse(match ? match[0] : text);
        return { passed: true, reason: "Output parsed as valid JSON." };
      } catch {
        return { passed: false, reason: "Output is not valid, parseable JSON." };
      }
    }
    case "contains_json": {
      const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (!match) return { passed: false, reason: "No JSON object or array found in the output." };
      try {
        JSON.parse(match[0]);
        return { passed: true, reason: "Found valid JSON embedded in the output." };
      } catch {
        return { passed: false, reason: "Found JSON-like text but it didn't parse." };
      }
    }
    case "is_xml": {
      const trimmed = text.trim();
      const passed = XML_TAG_PAIR.test(trimmed) && trimmed.startsWith("<");
      return { passed, reason: passed ? "Output looks like a well-formed XML document." : "Output is not well-formed XML." };
    }
    case "contains_xml": {
      const passed = XML_TAG_PAIR.test(text);
      return { passed, reason: passed ? "Found at least one XML tag pair." : "No XML tag pair found in the output." };
    }
    case "contains_sql": {
      const passed = SQL_KEYWORDS.test(text);
      return {
        passed,
        reason: passed ? "Found SQL-like syntax (heuristic keyword match)." : "No SQL-like syntax detected.",
      };
    }
    case "contains_html": {
      const passed = /<([a-zA-Z][\w:-]*)[^>]*>/.test(text);
      return { passed, reason: passed ? "Found at least one HTML tag." : "No HTML tag found in the output." };
    }
    case "levenshtein": {
      const reference = check.reference ?? "";
      const threshold = check.threshold ?? 10;
      const distance = levenshteinDistance(text.trim(), reference.trim());
      const passed = distance <= threshold;
      return {
        passed,
        reason: `Edit distance ${distance} vs. reference (max ${threshold} allowed).`,
      };
    }
    case "rouge_n": {
      const reference = check.reference ?? "";
      const threshold = check.threshold ?? 0.5;
      const score = rougeNScore(text, reference);
      const passed = score >= threshold;
      return {
        passed,
        reason: `Word-overlap score ${score.toFixed(2)} vs. reference (min ${threshold} required).`,
      };
    }
    case "latency": {
      return {
        passed: true,
        reason: `Latency check (max ${check.threshold ?? 0}ms) — this prototype doesn't track per-run latency yet, so this is a no-op pass.`,
      };
    }
    case "cost": {
      return {
        passed: true,
        reason: `Cost check (max $${check.threshold ?? 0}) — this prototype doesn't track per-run cost yet, so this is a no-op pass.`,
      };
    }
    case "regex_match": {
      try {
        const re = new RegExp(check.value, "i");
        const passed = re.test(text);
        return { passed, reason: passed ? `Matched /${check.value}/.` : `Did not match /${check.value}/.` };
      } catch {
        return { passed: false, reason: `Invalid regex: ${check.value}` };
      }
    }
    case "regex_excludes": {
      try {
        const re = new RegExp(check.value, "i");
        const passed = !re.test(text);
        return {
          passed,
          reason: passed ? `Correctly avoided /${check.value}/.` : `Output matches disallowed pattern /${check.value}/.`,
        };
      } catch {
        return { passed: false, reason: `Invalid regex: ${check.value}` };
      }
    }
    case "word_count": {
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      const { min, max } = check;
      let passed = true;
      if (min !== undefined) passed = passed && words >= min;
      if (max !== undefined) passed = passed && words <= max;
      const expected =
        min !== undefined && max !== undefined
          ? `${min}-${max}`
          : min !== undefined
            ? `at least ${min}`
            : max !== undefined
              ? `at most ${max}`
              : "any";
      return { passed, reason: `Output has ${words} word(s) (expected ${expected}).` };
    }
    default:
      return { passed: true, reason: "Unknown check type — skipped." };
  }
}

/**
 * Runs a `custom_code` assertion. JavaScript is executed for real, in-browser, via `new
 * Function` — the same contract as promptfoo's `javascript` assertion: return `true`/`false`,
 * or a truthy/falsy value. Python has no in-browser runtime, so it's stored but not executed —
 * a documented gap, not a silently-wrong result.
 */
export function scoreCustomCode(
  code: string,
  language: "javascript" | "python",
  output: string,
  input: string,
): { passed: boolean; reason: string } {
  if (language === "python") {
    return {
      passed: true,
      reason: "Python custom-code assertions aren't executed in this prototype (no in-browser runtime) — treated as pass.",
    };
  }
  if (!code.trim()) {
    return { passed: false, reason: "No code provided for this custom-code assertion." };
  }
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function("output", "input", code);
    const result = fn(output, input);
    if (result && typeof result === "object" && "pass" in result) {
      const r = result as { pass: boolean; reason?: string };
      return { passed: !!r.pass, reason: r.reason ?? (r.pass ? "Custom code passed." : "Custom code failed.") };
    }
    const passed = !!result;
    return { passed, reason: passed ? "Custom code returned a truthy value." : "Custom code returned a falsy value." };
  } catch (err) {
    return { passed: false, reason: `Custom code threw an error: ${(err as Error).message}` };
  }
}

export function describeScore(assertion: Assertion, passed: boolean): string {
  if (assertion.tier === "deterministic" && assertion.check) {
    return scoreCodeAssertion(assertion.check, "").reason;
  }
  if (assertion.tier === "custom_code") {
    return passed ? "Custom code: passed." : "Custom code: failed.";
  }
  return passed ? "Judge: satisfies the rubric." : "Judge: does not satisfy the rubric.";
}

/**
 * Scores one assertion (deterministic/custom_code/rubric_grading) against a simulated output —
 * the same three branches `runSuiteOffline` always had, just factored out so a composite/grouped
 * assertion's `children` (see `Assertion.children`) can call this per child too, not just the
 * top-level loop. `passed`/`itemId` drive the simulated-rubric branch's fake score exactly as
 * before; real deterministic/custom-code scoring ignores them (it scores the real output).
 */
function scoreOneAssertion(assertion: Assertion, passed: boolean, output: string, input: string, itemId: string): AssertionScore {
  if (assertion.children?.length) return scoreAssertionGroup(assertion, output, input, itemId);
  if (assertion.tier === "deterministic" && assertion.check) {
    const real = scoreCodeAssertion(assertion.check, output);
    return { assertionId: assertion.id, passed: real.passed, reason: real.reason, score: real.passed ? 1 : 0 };
  }
  if (assertion.tier === "custom_code" && assertion.code) {
    const real = scoreCustomCode(assertion.code, assertion.codeLanguage ?? "javascript", output, input);
    return { assertionId: assertion.id, passed: real.passed, reason: real.reason, score: real.passed ? 1 : 0 };
  }
  // Simulated rubric score: a plausible fractional value on the "passing"/"failing" side of
  // 0.5, not just a flat 1/0 — keeps the offline path exercising the same score field a live
  // llm-rubric judge would populate.
  const seed = seededRandom(`${itemId}:${assertion.id}:score`);
  const score = passed ? 0.7 + seed * 0.3 : seed * 0.5;
  return { assertionId: assertion.id, passed, reason: describeScore(assertion, passed), score };
}

/**
 * Composite/grouped assertion (`Assertion.children` set — promptfoo's `assert-set`): scores every
 * child independently by its own tier (one level deep only — a child's own `children` are ignored,
 * matching every real-world example seen so far), then rolls up to a single weighted-average score
 * carried on the parent, with the full per-child breakdown preserved on `childScores` for the UI.
 */
function scoreAssertionGroup(assertion: Assertion, output: string, input: string, itemId: string): AssertionScore {
  const children = assertion.children ?? [];
  const childScores = children.map((child) => {
    const seed = seededRandom(`${itemId}:${child.id}`);
    const passed = seed >= violationRate(child);
    return scoreOneAssertion(child, passed, output, input, itemId);
  });
  const totalWeight = children.reduce((sum, c) => sum + (c.weight ?? 1), 0) || 1;
  const weightedScore =
    childScores.reduce((sum, s, i) => sum + (s.score ?? (s.passed ? 1 : 0)) * (children[i].weight ?? 1), 0) / totalWeight;
  const threshold = assertion.groupThreshold ?? 0.5;
  const passed = weightedScore >= threshold;
  const failing = childScores
    .filter((s) => !s.passed)
    .map((s) => children.find((c) => c.id === s.assertionId)?.description)
    .filter(Boolean);
  return {
    assertionId: assertion.id,
    passed,
    score: weightedScore,
    reason: passed
      ? `Weighted score ${weightedScore.toFixed(2)} meets the ${threshold.toFixed(2)} threshold across ${children.length} sub-check(s).`
      : `Weighted score ${weightedScore.toFixed(2)} is below the ${threshold.toFixed(2)} threshold — dragged down by: ${failing.join(", ") || "one or more sub-checks"}.`,
    childScores,
  };
}

/** Fully offline/simulated suite run — used as the fallback when no LLM is configured or reachable. */
export function runSuiteOffline(spec: SpecProject, itemIds?: string[]): RunGroup {
  const target = spec.target;
  if (!target) throw new Error("Cannot run without a generated Target");

  const items = itemIds && itemIds.length > 0 ? spec.dataset.filter((d) => itemIds.includes(d.id)) : spec.dataset;

  const results: RunItemResult[] = items.map((item) => {
    const scored = spec.assertions.map((a) => {
      const seed = seededRandom(`${item.id}:${a.id}`);
      const passed = seed >= violationRate(a);
      return { assertion: a, passed };
    });

    const output = simulateOutput(item.input, scored);

    const scores: AssertionScore[] = scored.map(({ assertion, passed }) =>
      scoreOneAssertion(assertion, passed, output, item.input, item.id),
    );

    // Fabricated, not measured — same "directionally correct, not billing-grade" convention as
    // the Playground's offline path (`handlePlaygroundRun`'s simulated branch in apiPlugin.ts).
    const promptTokens = estimateTokens(item.input);
    const completionTokens = estimateTokens(output);
    const costUsd = estimateCostUsd(target.model, promptTokens, completionTokens);
    const latencyMs = Math.round(350 + seededRandom(`${item.id}:latency`) * 2400);
    const tokenUsage = { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };

    return { datasetItemId: item.id, output, scores, latencyMs, costUsd, tokenUsage };
  });

  return finalizeRun(results, "simulated", itemIds && itemIds.length > 0 ? "sample" : "full", target.id);
}

export function finalizeRun(
  results: RunItemResult[],
  mode: RunGroup["mode"],
  scope: RunGroup["scope"] = "full",
  targetId?: string,
  ranByUserId?: string,
): RunGroup {
  // n/a scores (a check that didn't apply to that row) count toward neither pass nor fail — same
  // exclusion `results.ts`'s row/assertion rollups apply, kept consistent here so the headline
  // number stamped onto the RunGroup always matches what the Results tab recomputes and displays.
  const totalScores = results.flatMap((r) => r.scores.filter((s) => !s.na));
  const passRate = totalScores.length
    ? totalScores.filter((s) => s.passed).length / totalScores.length
    : 0;

  return {
    id: newId("run"),
    createdAt: Date.now(),
    mode,
    results,
    passRate,
    scope,
    targetId,
    ranByUserId,
  };
}

/**
 * Free, instant "what to look at first" for a Run — no LLM call. Surfaces the rows with the most
 * failed checks (reviewFirst) and the assertions/latency patterns worth tightening (improvements).
 * This is what the Results pane shows by default; `/api/suggest-review-insights` (LLM-backed) is
 * an opt-in, deeper pass a user can request on top of this.
 */
export function suggestRunInsightsHeuristic(spec: SpecProject, run: RunGroup): RunInsights {
  const variableNames = datasetVariableNames(spec.target?.messages);
  const byItem = new Map(spec.dataset.map((d) => [d.id, d]));

  const withFails = run.results
    .map((r) => ({
      result: r,
      failed: r.scores.filter((s) => !s.passed),
    }))
    .filter((r) => r.failed.length > 0)
    .sort((a, b) => b.failed.length - a.failed.length);

  const reviewFirst = withFails.slice(0, 5).map(({ result, failed }) => {
    const item = byItem.get(result.datasetItemId);
    const label = item ? datasetItemLabel(item, variableNames) : result.datasetItemId;
    const assertionById = new Map(spec.assertions.map((a) => [a.id, a]));
    const names = failed
      .slice(0, 2)
      .map((s) => assertionById.get(s.assertionId)?.description ?? "a check")
      .join(", ");
    const more = failed.length > 2 ? ` and ${failed.length - 2} more` : "";
    return {
      datasetItemId: result.datasetItemId,
      reason: `Failed ${failed.length}/${result.scores.length} checks (${names}${more}) — "${label.slice(0, 60)}"`,
    };
  });

  const improvements: string[] = [];
  const assertionStats = spec.assertions.map((a) => {
    const scores = run.results.flatMap((r) => r.scores.filter((s) => s.assertionId === a.id));
    const total = scores.length;
    const failCount = scores.filter((s) => !s.passed).length;
    return { assertion: a, total, failCount, failRate: total ? failCount / total : 0 };
  });
  const worstAssertions = assertionStats
    .filter((s) => s.failCount > 0)
    .sort((a, b) => b.failRate - a.failRate)
    .slice(0, 3);
  for (const s of worstAssertions) {
    const pct = Math.round(s.failRate * 100);
    if (s.assertion.children?.length) {
      improvements.push(
        `"${s.assertion.description}" (a grouped/weighted assertion) misses its threshold ${pct}% of the time (${s.failCount}/${s.total}) — open a failing row's detail panel to see which sub-check is dragging the average down.`,
      );
    } else if (s.assertion.tier === "rubric_grading") {
      improvements.push(
        `"${s.assertion.description}" fails ${pct}% of the time (${s.failCount}/${s.total}) — consider tightening the rubric or the prompt's instructions around this.`,
      );
    } else if (s.assertion.tier === "custom_code") {
      improvements.push(
        `"${s.assertion.description}" fails ${pct}% of the time (${s.failCount}/${s.total}) — double-check the custom-code logic isn't too strict, or fix the prompt.`,
      );
    } else {
      improvements.push(
        `"${s.assertion.description}" fails ${pct}% of the time (${s.failCount}/${s.total}) — a deterministic check, so the prompt likely needs clearer/stronger wording here.`,
      );
    }
  }

  const withLatency = run.results.filter((r): r is RunItemResult & { latencyMs: number } => r.latencyMs !== undefined);
  if (withLatency.length >= 3) {
    const sorted = [...withLatency].sort((a, b) => a.latencyMs - b.latencyMs);
    const median = sorted[Math.floor(sorted.length / 2)].latencyMs;
    const slowest = sorted[sorted.length - 1];
    if (median > 0 && slowest.latencyMs > median * 2.5) {
      const item = byItem.get(slowest.datasetItemId);
      const label = item ? datasetItemLabel(item, variableNames) : slowest.datasetItemId;
      improvements.push(
        `One row took ${Math.round(slowest.latencyMs)}ms — over 2.5× the median (${Math.round(median)}ms): "${label.slice(0, 50)}". Worth checking for an unusually long input or a retry.`,
      );
    }
  }

  if (improvements.length === 0 && reviewFirst.length === 0) {
    improvements.push("Every row passed every check — consider whether the dataset is stressing the prompt enough.");
  }

  return { reviewFirst, improvements: improvements.slice(0, 4) };
}
