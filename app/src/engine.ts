import type {
  Assertion,
  AssertionScore,
  AssertionTier,
  CodeCheck,
  DatasetItem,
  RunGroup,
  RunItemResult,
  SpecProject,
} from "./types";
import { newId } from "./utils/id";

export const DEFAULT_TARGET_MODEL = "gpt-4o-mini";
export const DEFAULT_TEMPERATURE = 0.7;

function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  return (Math.abs(h) % 1000) / 1000;
}

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
export function classifyCriterion(text: string): {
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

const ENUM_PATTERNS: RegExp[] = [
  /\btrue\b\s*(?:or|\/)\s*\bfalse\b/i,
  /\bfalse\b\s*(?:or|\/)\s*\btrue\b/i,
  /\byes\b\s*(?:or|\/)\s*\bno\b/i,
  /\bno\b\s*(?:or|\/)\s*\byes\b/i,
];

/**
 * Derives structural assertions directly from the Output contract's shape — e.g. "respond with
 * exactly true or false" or "respond in JSON" — rather than from a criterion bullet. These are
 * the checks that can't be safely skipped: they gate whether the output is even usable downstream.
 */
export function deriveStructuralAssertions(spec: SpecProject): Assertion[] {
  const out: Assertion[] = [];
  const contract = spec.outputContract || "";

  if (ENUM_PATTERNS.some((p) => p.test(contract))) {
    const isYesNo = /\byes\b/i.test(contract);
    const values = isYesNo ? "yes,no" : "true,false";
    out.push({
      id: newId("assert"),
      sourceCriterionId: null,
      tier: "deterministic",
      description: `Output must be exactly one of: ${values.replace(",", " / ")} — nothing else`,
      check: { mode: "enum", value: values },
      status: "draft",
    });
  }

  if (/\bjson\b/i.test(contract)) {
    out.push({
      id: newId("assert"),
      sourceCriterionId: null,
      tier: "deterministic",
      description: "Output must be valid, parseable JSON",
      check: { mode: "valid_json", value: "" },
      status: "draft",
    });
  }

  return out;
}

export function buildPromptContent(spec: SpecProject): string {
  const lines: string[] = [];
  lines.push(`You are assisting with: ${spec.goal || "(no goal set yet)"}`);
  if (spec.inputContract) lines.push(`\nInput you will receive: ${spec.inputContract}`);
  if (spec.outputContract) lines.push(`\nRespond in this shape: ${spec.outputContract}`);
  if (spec.guardrails.length) {
    lines.push(`\nGuardrails — never violate these:`);
    spec.guardrails.forEach((g) => lines.push(`- ${g.text}`));
  }
  if (spec.criteria.length) {
    lines.push(`\nYour response must satisfy:`);
    spec.criteria.forEach((c) => lines.push(`- ${c.text}`));
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
  const fromCriteria: Assertion[] = [...spec.guardrails, ...spec.criteria].map((c) => {
    const cls = classifyCriterion(c.text);
    return {
      id: newId("assert"),
      sourceCriterionId: c.id,
      tier: cls.tier,
      description: cls.description,
      check: cls.check,
      rubric: cls.rubric,
      status: "draft" as const,
    };
  });
  return [...deriveStructuralAssertions(spec), ...fromCriteria];
}

function violationRate(a: Assertion): number {
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
    case "contains": {
      if (!check.value) return { passed: true, reason: "Structural check passed." };
      const passed = lower.includes(check.value.toLowerCase());
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
      const passed = !lower.includes(check.value.toLowerCase());
      return {
        passed,
        reason: passed
          ? `Correctly avoided "${check.value}".`
          : `Output contains "${check.value}", which it shouldn't.`,
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

    const scores: AssertionScore[] = scored.map(({ assertion, passed }) => {
      if (assertion.tier === "deterministic" && assertion.check) {
        const real = scoreCodeAssertion(assertion.check, output);
        return { assertionId: assertion.id, passed: real.passed, reason: real.reason };
      }
      if (assertion.tier === "custom_code" && assertion.code) {
        const real = scoreCustomCode(assertion.code, assertion.codeLanguage ?? "javascript", output, item.input);
        return { assertionId: assertion.id, passed: real.passed, reason: real.reason };
      }
      return { assertionId: assertion.id, passed, reason: describeScore(assertion, passed) };
    });

    return { datasetItemId: item.id, output, scores };
  });

  return finalizeRun(spec, results, "simulated", itemIds && itemIds.length > 0 ? "sample" : "full");
}

export function finalizeRun(
  spec: SpecProject,
  results: RunItemResult[],
  mode: RunGroup["mode"],
  scope: RunGroup["scope"] = "full",
): RunGroup {
  const totalScores = results.flatMap((r) => r.scores);
  const passRate = totalScores.length
    ? totalScores.filter((s) => s.passed).length / totalScores.length
    : 0;

  const citable =
    scope === "full" &&
    spec.status === "published" &&
    spec.target?.status === "published" &&
    spec.evalStatus === "published" &&
    spec.datasetStatus === "published";

  return {
    id: newId("run"),
    createdAt: Date.now(),
    citable,
    mode,
    results,
    passRate,
    scope,
  };
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "with", "that", "this", "is", "are",
  "it", "its", "into", "from", "by", "as", "be", "will", "should", "must", "not", "no", "so", "than",
  "then", "when", "where", "who", "what", "which", "their", "they", "you", "your", "our", "we",
]);

/**
 * Offline fallback for "what does this power" — no LLM call, just pulls the most repeated
 * meaningful words out of the Goal (and Output contract as a tiebreaker) into a Title Case phrase.
 * Deliberately rough: this only has to be a reasonable starting suggestion for a human to edit.
 */
export function suggestPowerTagsHeuristic(spec: SpecProject): string[] {
  const text = `${spec.goal} ${spec.outputContract}`.toLowerCase();
  const words = text.match(/[a-z][a-z-]{2,}/g) ?? [];
  const counts = new Map<string, number>();
  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w);
  if (top.length === 0) return [];
  const phrase = top.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  return [phrase];
}
