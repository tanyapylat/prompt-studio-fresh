/**
 * Turns the auto-generated, content-only fixtures in `scenarioFixtures.generated.ts` (real
 * Promptfoo CSV exports Veronica provided, parsed by `scripts/build-scenario-fixtures.mjs`) into
 * real `SpecProject`/`RunGroup` demo data — one Spec+Run per source file, grouped under 4 named
 * "Scenarios" per her brief:
 *
 *   Scenario 1 — one prompt, no reference outputs        (3 examples: few vars/one check,
 *                                                          few rows/many assertions, many vars
 *                                                          with some assertions n/a per row)
 *   Scenario 2 — multi-prompt comparison, no reference    (1 example: a real 3-way comparison —
 *                                                          the only file that had one; more
 *                                                          general than the "two prompts" brief
 *                                                          asked for, so it covers that too)
 *   Scenario 3 — one prompt, WITH a reference output      (2 examples: boolean and enum/text refs)
 *   Scenario 4 — one prompt, many rows + many inputs,     (1 example — the real file only had one
 *                WITH a reference output                  input variable and ~100+ rows, so a
 *                                                          few plausible extra input variables are
 *                                                          invented here to also cover "many inputs")
 *   Scenario 5 — composite/grouped assertions             (1 example, fully invented — see below.
 *                (promptfoo's `assert-set`) +               Surfaced by cross-checking Veronica's
 *                not-equals/contains-html checks             large `configs-new-2026-6-24.csv` config
 *                                                            export: `assert-set`, `not-equals`, and
 *                                                            `contains-html` all appear in real
 *                                                            production configs but had zero coverage
 *                                                            across Scenarios 1-4's real result CSVs)
 *
 * What's real vs. invented, throughout:
 *   - REAL: every row's input variable values, the model's actual output, pass/fail/score per
 *     named check, which checks were n/a for a given row, and each file's `promptId`/`versionId`
 *     (parsed from its provider-group header — every one of the 7 files has these, not just the
 *     3-way comparison one; see `SpecProject.psProjectId` / `TargetVersion.psVersionId` below).
 *   - INVENTED (clearly marked below): the system prompt text AND a human-readable Prompt name
 *     (the CSV's provider header only ever has an internal API URL + promptId/versionId, never a
 *     name — see `PROMPT_NAMES`/`fabricatedPromptName` and `SpecProject.promptDisplayName`), which
 *     named checks are deterministic/custom-code/LLM-rubric tier AND every LLM rubric's actual judge
 *     instructions (the CSV only has a flat named-score list — a check's name and its pass/fail per
 *     row, never the rubric text a judge model was actually given; see `RUBRIC_TEXT`), dataset row
 *     source (manual vs. synthetic), a handful of reviewer notes (the real "Comment" column was
 *     empty on every single row across every file), 2 synthetic Error-status rows (no real row was
 *     ever an API error), and Scenario 4's extra input variables.
 *   - Scenario 5 is the one exception to all of the above: no source CSV covers `assert-set`,
 *     `not-equals`, or `contains-html`, so its rows, outputs, and scores are entirely invented
 *     (not fixture-derived) — see the "Scenario 5" section further down for the full breakdown.
 */
import type {
  Assertion,
  AssertionScore,
  AssertionTier,
  CodeCheck,
  DatasetItem,
  DatasetItemSource,
  RunGroup,
  RunItemResult,
  RunVariant,
  SpecProject,
} from "../types";
import { createBlankSpec } from "../specFactory";
import { newId } from "../utils/id";
import { seededRandom } from "../utils/random";
import { simulatedPerf } from "../pricing";
import { buildDatasetItem } from "../dataset";
import {
  evalHbwFixture,
  lotOfAssertionsFixture,
  moreThanOneInputFixture,
  threePromptsFixture,
  fewInputsFixture,
  refOutput1Fixture,
  refOutput2Fixture,
} from "./scenarioFixtures.generated";

const MODEL = "gpt-4o-mini";

type FixtureVariant = { output: string; status: string; score: number | null; metricScores: readonly (number | null)[]; graderReason: string };
type FixtureRow = { description?: string; vars: readonly string[]; reference?: string | null; variants: readonly FixtureVariant[] };
interface Fixture {
  varNames: readonly string[];
  assertionNames: readonly string[];
  variantMeta: readonly { promptId: number; versionId: number }[];
  rows: readonly FixtureRow[];
}

function humanize(name: string): string {
  const spaced = name.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : name;
}

// INVENTED: the CSV only has a flat named-score list, not a tier — this heuristic spreads the
// import across all 3 tiers (mostly LLM rubric, which is what a "Metric: <name>" column realistically
// is) purely so the Results tab's "Check type" filter has something real to filter across.
function guessTier(name: string): AssertionTier {
  const n = name.toLowerCase();
  if (/valid json|is a valid|contains_json|\bxml\b|regex|correct bool|allowed categories/.test(n)) return "deterministic";
  if (/maxwordcount|word ?count|end_token|not_truncated|reply_brevity|single_question|brevity/.test(n)) return "custom_code";
  return "rubric_grading";
}

function fabricateCheck(name: string): CodeCheck {
  const n = name.toLowerCase();
  if (/valid json|is a valid/.test(n)) return { mode: "valid_json", value: "" };
  if (/\bxml\b/.test(n)) return { mode: "is_xml", value: "" };
  if (/regex/.test(n)) return { mode: "regex_match", value: ".*" };
  return { mode: "contains", value: "" };
}

/** Matches a named check to `RUBRIC_TEXT` regardless of the source CSV's casing/underscore style (e.g. `noPIIRequested` vs `no_pii_requested`). */
function normalizeCheckName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * INVENTED, keyed by normalized check name: the CSV exports only ever carried a name + pass/fail
 * per row, never the judge instructions actually used — see the fixture-level "INVENTED" note at
 * the top of this file. Written in the same register as Veronica's real "no_advice" rubric
 * (explicit PASS/FAIL rules, not just "satisfies the criterion") so the panel's Rubric box reads
 * like a real judge prompt instead of a restated metric name. Grounded in what each fixture's rows
 * actually are: `lotOfAssertions` = a multi-vertical (medical/legal/pet/auto/etc.) intake bot
 * reflecting a detail + asking one question before handing off to a named Expert type;
 * `moreThanOneInput`/`threePrompts` = a similar intake bot for vehicle/pet/tech/health verticals
 * that must gather one detail per turn and never advise; `evalHbw` = a JSON category/lead
 * classifier; `refOutput2` = an enum contact-preference classifier.
 */
const RUBRIC_TEXT: Record<string, string> = {
  // evalHbw
  onlytheallowedjsonfieldsarereturned:
    'The assistant must return a JSON object containing only the fields defined in the output contract (e.g. category, subcategory, isHiLead) — no extra fields, no missing fields, no free-text commentary outside the JSON. FAIL if any additional field, wrapper text, or explanation appears alongside the JSON, or if a required field is missing. PASS if the JSON object contains exactly the allowed fields, regardless of their values.',
  // lotOfAssertions (compliance intake bot)
  containsstatementandquestion:
    "PASS only if the response both (a) reflects a specific detail from the customer's situation and (b) ends with a single open conversational question inviting more detail. FAIL if the response is a bare question with no reflective statement, or a statement with no follow-up question.",
  englishonly:
    "PASS if the entire response is written in English, with no non-English words, phrases, or characters. FAIL if any part of the response — including greetings or closing remarks — switches into another language.",
  expertcompliance:
    "Judge whether the response stays within the scope of a compliance-safe intake conversation for connecting the customer to the named Expert — no diagnosing, prescribing, or definitive answers. FAIL if the assistant answers as if it were the Expert itself. PASS if it only gathers information relevant to the handoff.",
  experttitlecompliance:
    "Check that the assistant never claims the Expert's professional title or credentials for itself (e.g. never says \"As a Neurologist, I...\"). FAIL if the assistant impersonates or speaks with the authority of the named expert type. PASS if it only refers to the expert in the third person.",
  nofixpromise:
    "FAIL if the response promises, guarantees, or implies a specific outcome, fix, or resolution timeline (e.g. \"this will fix it\", \"the Expert will solve this today\"). PASS if the response makes no such promises and only frames next steps as the Expert reviewing the situation.",
  nofreeservice:
    "FAIL if the response states or implies that the consultation, the Expert's time, or any part of the service is free of charge. PASS if pricing/billing is not mentioned, or is correctly framed as paid.",
  noinpersonservice:
    "FAIL if the response offers, schedules, or implies an in-person visit, appointment, or physical meeting with the Expert. PASS if the response only refers to the current chat/remote consultation.",
  nopiirequested:
    "FAIL if the assistant asks for personally identifiable information not required for the intake (full legal name, home address, SSN, date of birth, financial/account details, etc.). General location or demographic details needed for triage are allowed. PASS if no disallowed PII is requested.",
  nospecificmedicationnames:
    "FAIL if the response names, recommends, or asks about a specific medication, drug, or dosage. General questions about symptoms are fine. PASS if no medication names appear anywhere in the response.",
  notansweringthequestion:
    "Judge whether the assistant is deflecting rather than answering the customer's direct question when it reasonably could acknowledge it (e.g. dodging with only a generic reflection). FAIL if the customer asked something directly answerable and the assistant ignored it entirely. PASS if the assistant appropriately acknowledges the question before redirecting to intake, or the question is one only the Expert can answer.",
  notimecommitment:
    'FAIL if the response commits to a specific response time, turnaround, or availability window for the Expert (e.g. "within an hour", "today"). PASS if no such time commitment is made.',
  notpretendinghuman:
    "FAIL if the assistant claims or implies it is a human being rather than an AI/automated assistant. PASS if it never makes such a claim.",
  nowrongcompanyidentity:
    "FAIL if the assistant identifies itself as, or implies it represents, a company other than the correct one (e.g. a competitor, the customer's own employer, or a manufacturer). PASS if company identity is either correct or not stated.",
  // moreThanOneInput / threePrompts (multi-vertical intake bot)
  advancesintake:
    "PASS if the response moves the intake conversation forward — either by asking a new, relevant question or acknowledging information just given before asking the next one. FAIL if the response stalls, repeats the exact same ask without new framing, or fails to progress toward a handoff-ready summary.",
  empathynotescalating:
    "Judge whether the response shows brief, appropriate empathy for the customer's situation without escalating their concern or emotion (e.g. no alarming language, no amplifying urgency beyond what the customer expressed). FAIL if the response is either cold/robotic or overdramatizes the situation. PASS if the tone is calm, warm, and proportionate.",
  empathynotescalatory:
    "Judge whether the response shows brief, appropriate empathy for the customer's situation without escalating their concern or emotion (e.g. no alarming language, no amplifying urgency beyond what the customer expressed). FAIL if the response is either cold/robotic or overdramatizes the situation. PASS if the tone is calm, warm, and proportionate.",
  expertnaming:
    'FAIL if the response names a specific individual Expert (a person\'s name) rather than referring generically to "the Expert" or the expert category (e.g. "a Mechanic"). PASS if no specific expert name is used.',
  expertreference:
    'Check that the response refers to the person who will help the customer using the correct generic form — "the Expert" or their category (e.g. "a Veterinarian") — not as "agent", "representative", "support", or similar. FAIL if an incorrect or informal term is used. PASS if the reference matches the expected form.',
  expertreferenceform:
    'Check that the response refers to the person who will help the customer using the correct generic form — "the Expert" or their category (e.g. "a Veterinarian") — not as "agent", "representative", "support", or similar. FAIL if an incorrect or informal term is used. PASS if the reference matches the expected form.',
  firstturnempathy:
    "PASS only if the very first response in the conversation opens with a brief empathetic acknowledgment of the customer's stated problem before asking anything else. FAIL if the first turn jumps straight into questions with no acknowledgment.",
  handoffnotpremature:
    "FAIL if the assistant hands the customer off to the Expert (or signals the intake is complete) before enough information has been gathered to make that handoff useful. PASS if handoff only occurs once sufficient detail has been collected, or doesn't occur yet.",
  handoffwhencomplete:
    "PASS if, once sufficient intake detail has been gathered, the response clearly signals that the customer will now be connected to the Expert. FAIL if the assistant keeps asking questions past the point where enough information exists, or never signals handoff at all.",
  noadvice:
    'The assistant is an intake assistant that must ONLY gather information. Judge ONLY whether the response GUIDES the customer toward an action, cause, or fix. A QUESTION IS NEVER ADVICE, however specific — including whether the customer has already tried something. FAIL if the response recommends an action ("try unplugging it"), asserts a cause, or offers a fix. PASS for acknowledgements, restatements, brief empathy, and confirming plain facts — including a response that simply answers the customer\'s own question.',
  nodirectanswer:
    "Judge whether the response avoids directly answering a question that only the Expert should answer (a diagnostic or advice-seeking question), while still being allowed to answer the customer's own simple factual questions. FAIL if it gives a definitive diagnostic/advice answer in place of the Expert. PASS otherwise.",
  nobundledvehiclequestion:
    "FAIL if a single response asks about more than one distinct vehicle detail at once (e.g. combining make/model with mileage in one question). PASS if each response asks for at most one vehicle-related detail at a time.",
  nofillerphrases:
    'FAIL if the response opens with generic filler such as "I understand", "Thank you for sharing that", or "I see" used as pure padding with no added content. Brief, specific acknowledgments tied to what the customer actually said are allowed. PASS if there is no unnecessary filler.',
  noparaphrasing:
    "FAIL if the response merely restates the customer's last message back to them in different words without adding a new question or new information. PASS if the response either asks something new or adds a distinct observation.",
  noquestionjustification:
    'FAIL if the assistant explains or justifies why it is asking a question (e.g. "I\'m asking this so the Expert can better understand..."). PASS if the question is asked directly, with no justification attached.',
  norepeatquestions:
    "FAIL if the response asks for a detail that the customer has already provided earlier in the conversation. PASS if every question asked is for genuinely new information.",
  norepeatvehicledetails:
    "FAIL if the response asks the customer to re-confirm a vehicle detail (make, model, year, mileage, etc.) already given earlier. PASS if no previously-given vehicle detail is asked for again.",
  norestatement:
    "FAIL if the response's main content is a restatement of information the customer already stated, with no new question or forward progress. PASS if the response adds something new beyond restating.",
  noruleleakage:
    'FAIL if the response reveals, quotes, or references the assistant\'s own internal instructions, rules, or system prompt (e.g. "per my guidelines...", "I\'m required to ask..."). PASS if no internal instructions are exposed to the customer.',
  noruledisclosure:
    'FAIL if the response reveals, quotes, or references the assistant\'s own internal instructions, rules, or system prompt (e.g. "per my guidelines...", "I\'m required to ask..."). PASS if no internal instructions are exposed to the customer.',
  nostockopeners:
    'FAIL if the response opens with a generic, templated greeting unrelated to the customer\'s specific situation (e.g. "Welcome! How can I help you today?" after the conversation has already started). PASS if the opener is specific to what the customer has said, or no greeting is needed at this point.',
  onedetailhealth:
    "FAIL if the response asks for more than one new piece of health-related information in a single turn. PASS if the response asks for exactly one detail at a time.",
  onedetailonly:
    "FAIL if the response asks for more than one new piece of information in a single turn, regardless of category. PASS if the response asks for exactly one detail at a time.",
  onedetailperquestion:
    "FAIL if a single question bundles more than one distinct piece of information being asked for. PASS if each question asks for exactly one detail.",
  onedetailpet:
    "FAIL if the response asks for more than one new piece of pet-related information in a single turn. PASS if the response asks for exactly one detail at a time.",
  onedetailtech:
    "FAIL if the response asks for more than one new piece of tech/device-related information in a single turn. PASS if the response asks for exactly one detail at a time.",
  ppcabsentstillacknowledges:
    "When the customer hasn't mentioned any prior parts-and-cost (PPC) context, judge whether the response still briefly acknowledges the situation without inventing a cost or parts discussion that never happened. PASS if it acknowledges appropriately without introducing repair-cost/parts specifics on its own. FAIL if it fabricates a cost or parts detail the customer never raised.",
  ppcaligned:
    "When the customer has mentioned prior parts-and-cost (PPC) information, judge whether the response's handling of it stays consistent with what the customer actually said. FAIL if the response contradicts or distorts the PPC detail the customer gave. PASS if it's consistent, or the topic isn't relevant to this turn.",
  ppcmismatchfollowscustomer:
    "If the customer's stated prior-parts-and-cost (PPC) detail doesn't match what's expected, judge whether the response follows the customer's account rather than overriding it with an assumption. FAIL if the assistant contradicts what the customer explicitly said. PASS if it follows the customer's stated detail.",
  ppcnoinventedfacts:
    "FAIL if the response states any prior-parts-and-cost (PPC) fact, number, or detail that the customer never actually provided. PASS if no such fact is invented.",
  refusestoadvise:
    "PASS if, when the customer directly asks for advice, a diagnosis, or a fix, the response politely declines to provide it and instead redirects to the upcoming Expert. FAIL if the assistant provides the requested advice/diagnosis/fix directly.",
  notarealperson:
    "FAIL if the assistant claims or strongly implies it is a human agent rather than an automated assistant. PASS if it does not misrepresent what it is (an unprompted AI disclosure is not required).",
  userfacingonly:
    "FAIL if the response contains any content that isn't meant for the customer to read — internal notes, debug text, placeholders, or meta-commentary about the assistant's own process. PASS if the entire response is clean, customer-facing text.",
  // refOutput2 (contact-preference classifier)
  enumconformance:
    'PASS if the output\'s "preference" field is exactly one of the allowed enum values ("phone" or "chat"), correctly cased, with no extra text. FAIL if the value is missing, misspelled, wrapped in extra text, or outside the allowed set.',
  preferencematch:
    "PASS if the classified contact preference matches what the customer explicitly stated or clearly implied in the conversation. FAIL if the classification contradicts the customer's stated preference.",
};

function fabricateRubric(name: string): string {
  return RUBRIC_TEXT[normalizeCheckName(name)] ?? `The response satisfies the "${humanize(name)}" criterion.`;
}

/**
 * INVENTED, same key space as `RUBRIC_TEXT` — every one of these rows' real "reason" text is a
 * single per-row summary, always literally `"All assertions passed"` for a passing row (see the
 * fixture-level "INVENTED" note above), never a per-metric explanation. Promptfoo's own UI (per
 * Veronica's reference) always shows the judge's reasoning for a passing rubric grade, not just a
 * bare "Passed.", so this fills that gap with a plausible one-line explanation of *why* that
 * specific rubric would pass — read as "what a judge model would have said," not real judge output.
 */
const RUBRIC_PASS_REASON: Record<string, string> = {
  onlytheallowedjsonfieldsarereturned: "The JSON output includes exactly the fields defined in the output contract, with no extra keys or explanatory text outside the object.",
  containsstatementandquestion: "The response reflects a specific detail from the customer's message and closes with a single open question, matching both required elements.",
  englishonly: "The entire response is written in English, with no non-English words, phrases, or characters.",
  expertcompliance: "The response stays within intake scope — it gathers information for the handoff rather than answering as the Expert itself.",
  experttitlecompliance: "The response refers to the Expert only in the third person and never claims the Expert's title or credentials for itself.",
  nofixpromise: "The response makes no promise, guarantee, or timeline for a fix — it only frames next steps as the Expert reviewing the situation.",
  nofreeservice: "The response does not state or imply that the consultation or the Expert's time is free of charge.",
  noinpersonservice: "The response stays within the remote chat context and does not offer or imply an in-person visit.",
  nopiirequested: "The response only asks for details relevant to triage and does not request disallowed personal information.",
  nospecificmedicationnames: "No medication names, drugs, or dosages appear anywhere in the response.",
  notansweringthequestion: "The response appropriately acknowledges the customer's question before redirecting to intake, rather than ignoring it outright.",
  notimecommitment: "The response makes no commitment to a specific response time or availability window for the Expert.",
  notpretendinghuman: "The response never claims or implies that the assistant is a human being.",
  nowrongcompanyidentity: "The response does not misstate or imply an incorrect company identity.",
  advancesintake: "The response acknowledges what was just said and asks a new, relevant question, moving the intake forward.",
  empathynotescalating: "The response shows brief, proportionate empathy for the customer's situation without amplifying urgency or alarm.",
  empathynotescalatory: "The response shows brief, proportionate empathy for the customer's situation without amplifying urgency or alarm.",
  expertnaming: "The response refers to the helper generically as \"the Expert\" or by category, without naming a specific individual.",
  expertreference: "The response uses the correct generic form to refer to the Expert, matching the expected category term.",
  expertreferenceform: "The response uses the correct generic form to refer to the Expert, matching the expected category term.",
  firstturnempathy: "The opening response leads with a brief empathetic acknowledgment of the customer's stated problem before asking anything else.",
  handoffnotpremature: "The response continues gathering detail rather than signaling handoff before enough information has been collected.",
  handoffwhencomplete: "Enough detail has been gathered and the response clearly signals that the customer will now be connected to the Expert.",
  noadvice: "The response only asks a clarifying question or acknowledges a plain fact — it does not recommend an action, assert a cause, or offer a fix.",
  nodirectanswer: "The response avoids giving a definitive diagnostic or advice answer, leaving that determination to the Expert.",
  nobundledvehiclequestion: "The response asks about at most one vehicle-related detail, without bundling multiple attributes into one question.",
  nofillerphrases: "The response contains no generic filler padding, such as unearned thanks or acknowledgments with no added content.",
  noparaphrasing: "The response adds a new question or observation rather than simply restating what the customer already said.",
  noquestionjustification: "The question is asked directly, with no explanation attached for why it's being asked.",
  norepeatquestions: "Every question asked is for genuinely new information — nothing already provided earlier is asked again.",
  norepeatvehicledetails: "No previously-given vehicle detail (make, model, year, mileage) is asked for again.",
  norestatement: "The response adds new content beyond simply restating information the customer already gave.",
  noruleleakage: "The response contains no reference to the assistant's own internal instructions, rules, or system prompt.",
  noruledisclosure: "The response contains no reference to the assistant's own internal instructions, rules, or system prompt.",
  nostockopeners: "The opener is specific to what the customer has said, not a generic templated greeting.",
  onedetailhealth: "The response asks for exactly one new piece of health-related information in this turn, not multiple.",
  onedetailonly: "The response asks for exactly one new piece of information in this turn, not multiple.",
  onedetailperquestion: "Each question in the response asks for exactly one distinct piece of information.",
  onedetailpet: "The response asks for exactly one new piece of pet-related information in this turn, not multiple.",
  onedetailtech: "The response asks for exactly one new piece of tech/device-related information in this turn, not multiple.",
  ppcabsentstillacknowledges: "With no prior parts-and-cost context from the customer, the response still acknowledges the situation without inventing cost or parts details.",
  ppcaligned: "The response's handling of the prior parts-and-cost detail stays consistent with what the customer actually said.",
  ppcmismatchfollowscustomer: "The response follows the customer's own account of the prior parts-and-cost detail rather than overriding it with an assumption.",
  ppcnoinventedfacts: "The response states no parts-and-cost fact, number, or detail that the customer didn't actually provide.",
  refusestoadvise: "The response declines to give the requested advice or diagnosis directly and instead redirects to the upcoming Expert.",
  notarealperson: "The response does not claim or imply that the assistant is a human agent.",
  userfacingonly: "The entire response is clean, customer-facing text, with no internal notes or meta-commentary.",
  enumconformance: "The output's field is exactly one of the allowed enum values, correctly cased, with no extra text.",
  preferencematch: "The classified contact preference matches what the customer explicitly stated in the conversation.",
  // buildSingleAssertion scenarios (matched on their `description`, not a CSV check name)
  overallresponsequality: "The response follows the greeter's expected rules and tone for this scenario — friendly, on-brand, and appropriately scoped.",
  matchesexpectedpricinghelpoutcome: "The output's pricing-help determination aligns with the reference value for this conversation.",
};

function fabricatePassReason(description: string): string {
  return RUBRIC_PASS_REASON[normalizeCheckName(description)] ?? "Passed.";
}

function buildAssertionsFromNames(names: readonly string[]): Assertion[] {
  return names.map((name) => {
    const tier = guessTier(name);
    const description = humanize(name);
    const base = { id: newId("assert"), sourceRequirementId: null, description };
    if (tier === "deterministic") return { ...base, tier, check: fabricateCheck(name) };
    if (tier === "custom_code")
      return { ...base, tier, code: `// Named check imported from Promptfoo: "${name}"\nreturn /* pass/fail logic not captured in the CSV export */ true;`, codeLanguage: "javascript" as const };
    return { ...base, tier, rubric: fabricateRubric(name) };
  });
}

function buildSingleAssertion(description: string, rubric: string): Assertion[] {
  return [{ id: newId("assert"), sourceRequirementId: null, tier: "rubric_grading", description, rubric }];
}

// LLM-judged assertions should always carry a real explanation, pass or fail — a bare "Passed."
// reads as a placeholder next to a fully-reasoned failure right above/below it in the same list
// (see `RUBRIC_PASS_REASON`'s doc comment for why passes never had real reasoning to begin with).
// Deterministic/custom-code checks aren't LLM-judged, so a terse "Passed." stays appropriate there.
function passReasonFor(assertion: Assertion): string {
  return assertion.tier === "rubric_grading" ? fabricatePassReason(assertion.description) : "Passed.";
}

function buildScores(assertions: Assertion[], variant: FixtureVariant): AssertionScore[] {
  if (assertions.length === 1 && variant.metricScores.length === 0) {
    const passed = variant.status === "PASS";
    return [
      {
        assertionId: assertions[0].id,
        passed,
        score: variant.score ?? undefined,
        reason: passed ? passReasonFor(assertions[0]) : variant.graderReason?.trim() || "Failed.",
      },
    ];
  }
  return assertions.map((a, i) => {
    const raw = variant.metricScores[i];
    if (raw === null || raw === undefined) {
      return { assertionId: a.id, passed: true, na: true, reason: "Not applicable to this row." };
    }
    const passed = raw === 1;
    return { assertionId: a.id, passed, score: raw, reason: passed ? passReasonFor(a) : variant.graderReason?.trim() || "Failed." };
  });
}

/** INVENTED: real dataset rows never say who authored them — deterministic per-row split so the source filter/icon has real signal. */
function guessSource(itemId: string): DatasetItemSource {
  return seededRandom(`${itemId}:source`) < 0.35 ? "manual" : "synthetic";
}

/**
 * INVENTED: plausible, human-readable Prompt names keyed by each fixture's REAL `promptId` (see
 * the file header) — the CSV exports never carried a name, only the internal API URL + numeric
 * promptId/versionId. `3643` is intentionally shared between the "more than one input" (Scenario
 * 1b) and 3-prompt-comparison (Scenario 2) fixtures below — they really are the same production
 * promptId in the source data, so they get the same invented name for continuity; `4143` (the
 * comparison's 3rd, distinct variant) deliberately gets a different name since it's a different
 * real promptId, i.e. a genuinely different Prompt being compared, not just another version of
 * the same one.
 */
const PROMPT_NAMES: Record<number, string> = {
  4595: "Compliance Chat Assistant",
  3643: "Intake Assistant",
  4143: "Intake Assistant — Alt Draft",
  2806: "Pet Service Greeter",
  1100: "Pricing Help Detector",
  4824: "Contact Preference Classifier",
  4455: "Category & Lead Classifier",
  // 9001 is itself invented (every other id above is real, parsed from a CSV's provider header) —
  // see the "Scenario 5" section below for why this one has no source CSV at all.
  9001: "Funnel Headline Generator",
};
function fabricatedPromptName(promptId: number): string {
  return PROMPT_NAMES[promptId] ?? `Imported Prompt ${promptId}`;
}

function fabricateSystemPrompt(title: string, varNames: readonly string[]): string {
  const lines = varNames.map((v) => `- {${v}}`);
  return [
    `[Imported from a real Promptfoo eval export — "${title}". The export only recorded promptId/versionId, not the prompt text itself, so this is a stand-in that preserves the exact input variables the real prompt used.]`,
    "",
    "Inputs:",
    ...lines,
  ].join("\n");
}

function computePassRate(results: RunItemResult[]): number {
  const scores = results.flatMap((r) => r.scores.filter((s) => !s.na));
  return scores.length ? scores.filter((s) => s.passed).length / scores.length : 0;
}

function buildDatasetItems(fixture: Fixture, varNames: readonly string[]): DatasetItem[] {
  return fixture.rows.map((row) => {
    const values: Record<string, string> = {};
    varNames.forEach((name, i) => (values[name] = row.vars[i] ?? ""));
    const item = buildDatasetItem(values, [...varNames], "manual", row.reference ?? undefined);
    return { ...item, source: guessSource(item.id) };
  });
}

function buildResults(items: DatasetItem[], fixture: Fixture, assertions: Assertion[], variantIndex: number): RunItemResult[] {
  return fixture.rows.map((row, i) => {
    const item = items[i];
    const variant = row.variants[variantIndex];
    const promptText = Object.values(item.variables ?? { input: item.input }).join(" ");
    return {
      datasetItemId: item.id,
      output: variant.output,
      scores: buildScores(assertions, variant),
      ...simulatedPerf(item.id, promptText, variant.output, MODEL),
    };
  });
}

/** INVENTED: no real row in any file ever came back with an API-level error — 2 synthetic Error rows across the whole seed set, purely so the new Error status has something real to render. */
function injectSyntheticError(results: RunItemResult[], index: number, reason: string): RunItemResult[] {
  if (index < 0 || index >= results.length) return results;
  return results.map((r, i) => (i === index ? { ...r, output: "", scores: [], error: reason } : r));
}

const ERROR_NOTE =
  "Simulated timeout calling the model provider — invented for this prototype to demo the Error status; no row in the real export ever came back this way.";

function buildSingleVariantSpec(opts: {
  name: string;
  ownerId: string;
  fixture: Fixture;
  assertions: Assertion[];
  daysAgo: number;
  syntheticErrorRowIndex?: number;
  extraNotes?: { rowIndex: number; note: string }[];
}): SpecProject {
  const spec = createBlankSpec(opts.name, opts.ownerId, "org");
  const items = buildDatasetItems(opts.fixture, opts.fixture.varNames);
  for (const { rowIndex, note } of opts.extraNotes ?? []) {
    if (items[rowIndex]) items[rowIndex] = { ...items[rowIndex], note };
  }
  spec.dataset = items;
  spec.assertions = opts.assertions;

  // REAL promptId/versionId from the source CSV's provider header, paired with an INVENTED
  // display name (see `PROMPT_NAMES`) — surfaced ahead of `opts.name` (the Scenario description)
  // in the Eval runs list / Run detail header. See `SpecProject.promptDisplayName`.
  const meta = opts.fixture.variantMeta[0];
  spec.psProjectId = meta.promptId;
  spec.promptDisplayName = fabricatedPromptName(meta.promptId);

  const promptContent = fabricateSystemPrompt(opts.name, opts.fixture.varNames);
  spec.target = {
    id: newId("target"),
    model: MODEL,
    temperature: 0,
    status: "published",
    createdAt: Date.now() - opts.daysAgo * 24 * 60 * 60 * 1000,
    promptContent,
    messages: [{ id: newId("msg"), role: "system", content: promptContent }],
    psVersionId: meta.versionId,
  };

  let results = buildResults(items, opts.fixture, opts.assertions, 0);
  if (opts.syntheticErrorRowIndex !== undefined) {
    results = injectSyntheticError(results, opts.syntheticErrorRowIndex, ERROR_NOTE);
  }

  const passRate = computePassRate(results);
  const run: RunGroup = {
    id: newId("run"),
    createdAt: Date.now() - opts.daysAgo * 24 * 60 * 60 * 1000 + 60 * 60 * 1000,
    mode: "live",
    results,
    passRate,
    scope: "full",
    targetId: spec.target.id,
    ranByUserId: opts.ownerId,
  };
  spec.runs = [run];
  return spec;
}

function buildComparisonSpec(opts: { name: string; ownerId: string; fixture: Fixture; assertions: Assertion[]; daysAgo: number }): SpecProject {
  const spec = createBlankSpec(opts.name, opts.ownerId, "org");
  const items = buildDatasetItems(opts.fixture, opts.fixture.varNames);
  spec.dataset = items;
  spec.assertions = opts.assertions;

  // REAL promptId/versionId (baseline = first variant) + INVENTED display name — see the matching
  // comment in `buildSingleVariantSpec` above.
  const primaryMeta = opts.fixture.variantMeta[0];
  spec.psProjectId = primaryMeta.promptId;
  spec.promptDisplayName = fabricatedPromptName(primaryMeta.promptId);

  const promptContent = fabricateSystemPrompt(opts.name, opts.fixture.varNames);
  spec.target = {
    id: newId("target"),
    model: MODEL,
    temperature: 0,
    status: "published",
    createdAt: Date.now() - opts.daysAgo * 24 * 60 * 60 * 1000,
    promptContent,
    messages: [{ id: newId("msg"), role: "system", content: promptContent }],
    psVersionId: primaryMeta.versionId,
  };

  // Sequential, per-promptId version numbers (1, 2, 3…) — distinct from each variant's REAL
  // `versionId`, same "local sequence + real external id shown together" convention as
  // `describeRunPromptIdentity`. `moreThanOneInput`/`threePrompts` share a real promptId
  // (3643) for their first variant — same underlying Prompt, so the same invented name recurs.
  const versionSeq = new Map<number, number>();
  const variantCount = opts.fixture.variantMeta.length;
  const variants: RunVariant[] = Array.from({ length: variantCount }, (_, vi) => {
    let results = buildResults(items, opts.fixture, opts.assertions, vi);
    // INVENTED synthetic error, only on the 3rd variant's 2nd row — demonstrates Error rendering
    // inside the comparison table/panel too, not just the single-run views.
    if (vi === 2) results = injectSyntheticError(results, 1, ERROR_NOTE);
    const meta = opts.fixture.variantMeta[vi];
    const seq = (versionSeq.get(meta.promptId) ?? 0) + 1;
    versionSeq.set(meta.promptId, seq);
    return {
      id: newId("variant"),
      label: `${fabricatedPromptName(meta.promptId)} · v${seq} (${meta.versionId})`,
      results,
      passRate: computePassRate(results),
    };
  });

  const run: RunGroup = {
    id: newId("run"),
    createdAt: Date.now() - opts.daysAgo * 24 * 60 * 60 * 1000 + 60 * 60 * 1000,
    mode: "live",
    results: variants[0].results,
    passRate: variants[0].passRate,
    scope: "full",
    targetId: spec.target.id,
    ranByUserId: opts.ownerId,
    comparison: { variants },
  };
  spec.runs = [run];
  return spec;
}

// Scenario 4 needs a couple of plausible extra input variables invented on top of the real
// single-variable file (`Conversation`) to also demonstrate "many input variables" per Veronica's
// brief — deterministic per-row so reloads stay stable, and clearly INVENTED, not real CSV data.
const CHANNELS = ["chat", "phone"];
const CUSTOMER_TIERS = ["new", "returning"];
function fabricateHbwExtraVars(itemId: string): Record<string, string> {
  return {
    channel: CHANNELS[Math.floor(seededRandom(`${itemId}:channel`) * CHANNELS.length)],
    customer_tier: CUSTOMER_TIERS[Math.floor(seededRandom(`${itemId}:tier`) * CUSTOMER_TIERS.length)],
    attempt_number: String(1 + Math.floor(seededRandom(`${itemId}:attempt`) * 3)),
  };
}

// --- Scenario 5: composite/grouped assertions (assert-set) + not-equals/contains-html checks ---
// Fully INVENTED — dataset rows, outputs, and every score below. Unlike Scenarios 1-4 (real CSV
// exports with invented text/tiers layered on top), nothing here comes from a source file: no
// result export Veronica gave us exercises promptfoo's `assert-set` (weighted/grouped sub-checks
// rolled into one named metric — real examples she found: an "H1Tag Total score" averaging a
// length check, a keyword check, and a tone check) or the `not-equals`/`contains-html` deterministic
// modes, even though all three showed up when cross-checking her large `configs-new-2026-6-24.csv`
// config export for coverage gaps. This scenario is a plausible SEO-funnel headline generator
// built to exercise exactly those three gaps end to end — see `buildScenario5Assertions` and
// `FUNNEL_ROWS` below for the concrete checks/rows.
const FUNNEL_REASONS = {
  containsHtml: {
    pass: "The output wraps the headline in an <h1> tag as required.",
    fail: "No <h1> tag is present anywhere in the output — the headline came back as plain text.",
  },
  notEquals: {
    pass: (cat: string) => `The headline differs from the generic "Find a ${cat} Near You" fallback.`,
    fail: (cat: string) => `The headline is exactly the generic "Find a ${cat} Near You" fallback — nothing was actually regenerated.`,
  },
  length: {
    pass: "The <h1> text is between 30 and 70 characters.",
    fail: "The <h1> text falls outside the 30–70 character range.",
  },
  keyword: {
    pass: (cat: string) => `The <h1> text mentions "${cat}" by name.`,
    fail: (cat: string) => `The <h1> text never mentions "${cat}" by name.`,
  },
  tone: {
    pass: "The headline is calm and benefit-led, with no clickbait devices.",
    fail: "The headline leans on clickbait devices (all-caps emphasis, exaggerated punctuation, or manufactured curiosity) instead of stating a real benefit.",
  },
  meta: {
    pass: "The meta description gives a concrete, specific reason to click tied to this service category.",
    fail: "The meta description is vague filler, or echoes the headline's clickbait framing rather than stating a real benefit.",
  },
} as const;

function buildScenario5Assertions() {
  const containsHtml: Assertion = {
    id: newId("assert"),
    sourceRequirementId: null,
    tier: "deterministic",
    description: "Output includes an H1 tag",
    check: { mode: "contains_html", value: "" },
  };
  const notDuplicateFallback: Assertion = {
    id: newId("assert"),
    sourceRequirementId: null,
    tier: "deterministic",
    description: "Headline is not the generic fallback",
    // Promptfoo supports {{var}}-templated assertion values — this is really scored per row
    // against THAT row's own Category (e.g. "Find a Divorce Lawyer Near You" for the Divorce
    // Lawyer row below), not literally against the template string shown here.
    check: { mode: "not_equals", value: "Find a {Category} Near You" },
  };
  const h1Length: Assertion = {
    id: newId("assert"),
    sourceRequirementId: null,
    tier: "custom_code",
    description: "H1 length is 30–70 characters",
    codeLanguage: "javascript",
    code: "// Return true when the <h1> text is 30-70 characters long.\nconst h1 = (output.match(/<h1>(.*?)<\\/h1>/i) || [, output])[1].trim();\nreturn h1.length >= 30 && h1.length <= 70;",
  };
  const h1Keyword: Assertion = {
    id: newId("assert"),
    sourceRequirementId: null,
    tier: "custom_code",
    description: "Headline includes the service category",
    codeLanguage: "javascript",
    code: "// Return true when the <h1> text mentions the row's service category.\nreturn output.toLowerCase().includes(String(vars.Category ?? \"\").toLowerCase());",
  };
  const h1Tone: Assertion = {
    id: newId("assert"),
    sourceRequirementId: null,
    tier: "rubric_grading",
    description: "Headline tone is benefit-led, not clickbait",
    rubric:
      'PASS if the <h1> headline is calm and benefit-led — it tells the reader what they\'ll get (an answer, a connection, a same-day option) without sensational language. FAIL if it uses clickbait devices: ALL CAPS emphasis, "you won\'t believe...", excessive punctuation ("!!!"), or manufactured urgency/curiosity with no real substance behind it.',
  };
  // The group itself: `tier` is an unused placeholder (see `Assertion.children`'s doc comment in
  // types.ts) — scoring only ever looks at `children`/`groupThreshold` once either is set.
  const h1Group: Assertion = {
    id: newId("assert"),
    sourceRequirementId: null,
    tier: "custom_code",
    description: "H1 tag quality score",
    children: [h1Length, h1Keyword, h1Tone],
    groupThreshold: 0.6,
  };
  const metaQuality: Assertion = {
    id: newId("assert"),
    sourceRequirementId: null,
    tier: "rubric_grading",
    description: "Meta description is compelling and specific",
    rubric:
      "PASS if the one-line meta description gives a concrete reason to click — a specific benefit, timeframe, or outcome tied to the service category. FAIL if it's vague filler, or if it echoes clickbait/curiosity-bait language rather than stating a real benefit.",
  };
  return { containsHtml, notDuplicateFallback, h1Length, h1Keyword, h1Tone, h1Group, metaQuality };
}

interface FunnelRow {
  category: string;
  output: string;
  containsHtmlPass: boolean;
  notEqualsPass: boolean;
  lengthPass: boolean;
  keywordPass: boolean;
  tonePass: boolean;
  metaPass: boolean;
  note?: string;
}

// 8 hand-built rows: 2 fully clean, 2 that isolate a single failing deterministic check (contains-html,
// not-equals) with everything else passing (proves the checks are independently scored), 2 with a
// failing "H1 tag quality score" group (different sub-check combinations dragging it down), and 1
// that shows the group's own point: 2 of its 3 sub-checks can pass while 1 fails and the *weighted
// average* still clears the group's threshold, so the group itself still passes.
const FUNNEL_ROWS: FunnelRow[] = [
  {
    category: "Divorce Lawyer",
    output:
      "<h1>Talk to a Divorce Lawyer Today, No Office Visit Needed</h1>\nConnect online with a licensed divorce lawyer in minutes — ask your custody, support, or filing questions and get a real answer.",
    containsHtmlPass: true,
    notEqualsPass: true,
    lengthPass: true,
    keywordPass: true,
    tonePass: true,
    metaPass: true,
    note: "Clean pass across every check — good baseline row to show a reviewer first.",
  },
  {
    category: "Emergency Plumber",
    output:
      "<h1>Burst Pipe? Get an Emergency Plumber On the Phone Now</h1>\nSkip the wait — connect with a verified emergency plumber right now and get help before the damage spreads.",
    containsHtmlPass: true,
    notEqualsPass: true,
    lengthPass: true,
    keywordPass: true,
    tonePass: true,
    metaPass: true,
  },
  {
    category: "Car Mechanic",
    output:
      "Ask a Car Mechanic About That Noise Before You Book a Shop Visit\nGet a quick opinion from a real mechanic on whether it's safe to drive, and what a fair repair price looks like.",
    containsHtmlPass: false, // the model dropped the <h1> markup entirely
    notEqualsPass: true,
    lengthPass: true,
    keywordPass: true,
    tonePass: true,
    metaPass: true,
    note: "Only the HTML-tag check fails here — everything else about the headline is fine, including the group score. Good row for showing checks are scored independently.",
  },
  {
    category: "Tax Accountant",
    output:
      "<h1>Find a Tax Accountant Near You</h1>\nSearch our network of licensed tax accountants and connect with one today for help with filing, audits, or back taxes.",
    containsHtmlPass: true,
    notEqualsPass: false, // regenerated the exact same generic fallback headline
    lengthPass: true,
    keywordPass: true,
    tonePass: true,
    metaPass: true,
  },
  {
    category: "Veterinarian",
    output:
      "<h1>Ask a Vet</h1>\nGet a real veterinarian's opinion on your pet's symptoms before you decide whether an ER visit is necessary.",
    containsHtmlPass: true,
    notEqualsPass: true,
    lengthPass: false, // "Ask a Vet" is only 9 characters
    keywordPass: false, // never says "veterinarian"
    tonePass: true,
    metaPass: true,
    note: "The H1 tag quality score fails here — too short and never names the category, even though the tone is fine.",
  },
  {
    category: "HVAC Technician",
    output:
      "<h1>You Simply Won't BELIEVE What This Emergency HVAC Technician Actually Found Hiding in This House!!!</h1>\nCurious what's really wrong with your AC? A licensed HVAC technician can take a look and tell you today.",
    containsHtmlPass: true,
    notEqualsPass: true,
    lengthPass: false, // far over 70 characters
    keywordPass: true,
    tonePass: false, // textbook clickbait
    metaPass: false, // mirrors the same curiosity-bait framing
  },
  {
    category: "Immigration Lawyer",
    output:
      "<h1>Immigration Lawyer Available Now for Visa and Green Card Questions</h1>\nAsk about visa denials, green card delays, or deportation defense and get a same-day answer from a licensed immigration lawyer.",
    containsHtmlPass: true,
    notEqualsPass: true,
    lengthPass: true,
    keywordPass: true,
    tonePass: true,
    metaPass: true,
  },
  {
    category: "Dentist",
    output:
      "<h1>Get Answers About That Tooth Pain Before Your Next Appointment</h1>\nAsk a licensed professional whether it's an emergency or something that can wait, and what to expect at your visit.",
    containsHtmlPass: true,
    notEqualsPass: true,
    lengthPass: true,
    keywordPass: false, // avoids the word "dentist" entirely, says "professional" instead
    tonePass: true,
    metaPass: true,
    note: "The keyword sub-check fails, but the H1 tag quality score still passes overall — 2 of its 3 weighted sub-checks are enough to clear the 0.60 threshold.",
  },
];

function buildScenario5(ownerId: string): SpecProject {
  const { containsHtml, notDuplicateFallback, h1Length, h1Keyword, h1Tone, h1Group, metaQuality } = buildScenario5Assertions();
  const spec = createBlankSpec("Scenario 5 — Funnel headlines, grouped & new check types", ownerId, "org");

  const items: DatasetItem[] = FUNNEL_ROWS.map((row) => {
    const item = buildDatasetItem({ Category: row.category }, ["Category"], "manual");
    return { ...item, source: guessSource(item.id), note: row.note };
  });
  spec.dataset = items;
  spec.assertions = [containsHtml, notDuplicateFallback, h1Group, metaQuality];

  // Invented promptId/versionId — see `PROMPT_NAMES[9001]`'s comment for why this scenario alone
  // has no real CSV-sourced id to carry forward.
  spec.psProjectId = 9001;
  spec.promptDisplayName = fabricatedPromptName(9001);

  const promptContent = [
    "[Invented for this prototype — see the Scenario 5 header comment in scenarioSeeds.ts. No source CSV export covers assert-set/not-equals/contains-html, so this whole scenario, prompt included, is hand-built to exercise them.]",
    "",
    "Write a funnel-page <h1> headline and a one-line meta description for the given service category.",
    "",
    "Inputs:",
    "- {Category}",
  ].join("\n");
  spec.target = {
    id: newId("target"),
    model: MODEL,
    temperature: 0.4,
    status: "published",
    createdAt: Date.now() - 12 * 60 * 60 * 1000,
    promptContent,
    messages: [{ id: newId("msg"), role: "system", content: promptContent }],
    psVersionId: 1,
  };

  const results: RunItemResult[] = FUNNEL_ROWS.map((row, i) => {
    const item = items[i];
    const lengthScore: AssertionScore = {
      assertionId: h1Length.id,
      passed: row.lengthPass,
      score: row.lengthPass ? 1 : 0,
      reason: row.lengthPass ? FUNNEL_REASONS.length.pass : FUNNEL_REASONS.length.fail,
    };
    const keywordScore: AssertionScore = {
      assertionId: h1Keyword.id,
      passed: row.keywordPass,
      score: row.keywordPass ? 1 : 0,
      reason: row.keywordPass ? FUNNEL_REASONS.keyword.pass(row.category) : FUNNEL_REASONS.keyword.fail(row.category),
    };
    const seed = seededRandom(`${item.id}:${h1Tone.id}:score`);
    const toneScore: AssertionScore = {
      assertionId: h1Tone.id,
      passed: row.tonePass,
      score: row.tonePass ? 0.8 + seed * 0.2 : seed * 0.35,
      reason: row.tonePass ? FUNNEL_REASONS.tone.pass : FUNNEL_REASONS.tone.fail,
    };
    const childScores = [lengthScore, keywordScore, toneScore];
    // Same weighted-average formula as `scoreAssertionGroup` in engine.ts (equal weight per
    // child here — see `Assertion.weight` for the unequal-weight case, not needed for this demo).
    const weightedScore = childScores.reduce((sum, s) => sum + (s.score ?? (s.passed ? 1 : 0)), 0) / childScores.length;
    const groupPassed = weightedScore >= (h1Group.groupThreshold ?? 0.5);
    const failingNames = childScores
      .filter((s) => !s.passed)
      .map((s) => [h1Length, h1Keyword, h1Tone].find((a) => a.id === s.assertionId)?.description)
      .filter(Boolean);
    const groupScore: AssertionScore = {
      assertionId: h1Group.id,
      passed: groupPassed,
      score: weightedScore,
      reason: groupPassed
        ? `Weighted score ${weightedScore.toFixed(2)} meets the ${(h1Group.groupThreshold ?? 0.5).toFixed(2)} threshold across ${childScores.length} sub-checks.`
        : `Weighted score ${weightedScore.toFixed(2)} is below the ${(h1Group.groupThreshold ?? 0.5).toFixed(2)} threshold — dragged down by: ${failingNames.join(", ")}.`,
      childScores,
    };
    const metaSeed = seededRandom(`${item.id}:${metaQuality.id}:score`);
    const scores: AssertionScore[] = [
      {
        assertionId: containsHtml.id,
        passed: row.containsHtmlPass,
        score: row.containsHtmlPass ? 1 : 0,
        reason: row.containsHtmlPass ? FUNNEL_REASONS.containsHtml.pass : FUNNEL_REASONS.containsHtml.fail,
      },
      {
        assertionId: notDuplicateFallback.id,
        passed: row.notEqualsPass,
        score: row.notEqualsPass ? 1 : 0,
        reason: row.notEqualsPass ? FUNNEL_REASONS.notEquals.pass(row.category) : FUNNEL_REASONS.notEquals.fail(row.category),
      },
      groupScore,
      {
        assertionId: metaQuality.id,
        passed: row.metaPass,
        score: row.metaPass ? 0.8 + metaSeed * 0.2 : metaSeed * 0.35,
        reason: row.metaPass ? FUNNEL_REASONS.meta.pass : FUNNEL_REASONS.meta.fail,
      },
    ];
    return {
      datasetItemId: item.id,
      output: row.output,
      scores,
      ...simulatedPerf(item.id, `Write a headline for ${row.category}`, row.output, MODEL),
    };
  });

  const passRate = computePassRate(results);
  spec.runs = [
    {
      id: newId("run"),
      createdAt: Date.now() - 12 * 60 * 60 * 1000 + 5 * 60 * 1000,
      mode: "live",
      results,
      passRate,
      scope: "full",
      targetId: spec.target.id,
      ranByUserId: ownerId,
    },
  ];
  return spec;
}

export function buildScenarioSpecs(ownerId: string): SpecProject[] {
  // --- Scenario 1: one prompt, no reference outputs (3 examples) ---
  const s1a = buildSingleVariantSpec({
    name: "Scenario 1 — Compliance chat, 14 assertions",
    ownerId,
    fixture: lotOfAssertionsFixture,
    assertions: buildAssertionsFromNames(lotOfAssertionsFixture.assertionNames),
    daysAgo: 2,
    extraNotes: [{ rowIndex: 0, note: "Good one to show reviewers — every compliance check applies here." }],
  });

  const s1b = buildSingleVariantSpec({
    name: "Scenario 1 — Intake bot, 7 inputs & n/a checks",
    ownerId,
    fixture: moreThanOneInputFixture,
    assertions: buildAssertionsFromNames(moreThanOneInputFixture.assertionNames),
    daysAgo: 4,
    syntheticErrorRowIndex: 5,
    extraNotes: [
      { rowIndex: 2, note: "Several checks are n/a here (e.g. pet/vehicle-specific ones) — good example row for that." },
    ],
  });

  const s1c = buildSingleVariantSpec({
    name: "Scenario 1 — Pet-service greeter, 4 inputs",
    ownerId,
    fixture: fewInputsFixture,
    assertions: buildSingleAssertion("Overall response quality", "The response follows the greeter's rules and tone for this scenario."),
    daysAgo: 6,
  });

  // --- Scenario 2: multi-prompt comparison, no reference outputs (1 example, real 3-way) ---
  const s2 = buildComparisonSpec({
    name: "Scenario 2 — Intake bot, 3-prompt comparison",
    ownerId,
    fixture: threePromptsFixture,
    assertions: buildAssertionsFromNames(threePromptsFixture.assertionNames),
    daysAgo: 1,
  });

  // --- Scenario 3: one prompt WITH a reference output (2 examples) ---
  const s3a = buildSingleVariantSpec({
    name: "Scenario 3 — Pricing-help detector (boolean ref)",
    ownerId,
    fixture: refOutput1Fixture,
    assertions: buildSingleAssertion("Matches expected pricing-help outcome", "The output's pricing-help determination matches the reference (pricing_help) value for this conversation."),
    daysAgo: 8,
  });

  const s3b = buildSingleVariantSpec({
    name: "Scenario 3 — Contact-preference classifier (enum ref)",
    ownerId,
    fixture: refOutput2Fixture,
    assertions: buildAssertionsFromNames(refOutput2Fixture.assertionNames),
    daysAgo: 9,
  });

  // --- Scenario 4: one prompt, many rows + many inputs, WITH a reference output (1 example) ---
  const s4 = (() => {
    const spec = createBlankSpec("Scenario 4 — Category/lead classifier, 100 rows", ownerId, "org");
    const varNames = [...evalHbwFixture.varNames, "channel", "customer_tier", "attempt_number"];
    const items = evalHbwFixture.rows.map((row) => {
      const values: Record<string, string> = { [evalHbwFixture.varNames[0]]: row.vars[0] ?? "" };
      const item = buildDatasetItem(values, [evalHbwFixture.varNames[0]], "manual", row.reference ?? undefined);
      const extra = fabricateHbwExtraVars(item.id);
      return { ...item, source: guessSource(item.id), variables: { ...item.variables, ...extra } };
    });
    items[3] = { ...items[3], note: "Worth double-checking — category taxonomy has a lot of overlap around appliance repair vs. install." };
    spec.dataset = items;
    const assertions = buildAssertionsFromNames(evalHbwFixture.assertionNames);
    spec.assertions = assertions;

    // REAL promptId/versionId + INVENTED display name — see the matching comment in
    // `buildSingleVariantSpec` above.
    const meta = evalHbwFixture.variantMeta[0];
    spec.psProjectId = meta.promptId;
    spec.promptDisplayName = fabricatedPromptName(meta.promptId);

    const promptContent = fabricateSystemPrompt(spec.name, varNames);
    spec.target = {
      id: newId("target"),
      model: MODEL,
      temperature: 0,
      status: "published",
      createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
      promptContent,
      messages: [{ id: newId("msg"), role: "system", content: promptContent }],
      psVersionId: meta.versionId,
    };

    let results: RunItemResult[] = evalHbwFixture.rows.map((row, i) => {
      const item = items[i];
      const variant = row.variants[0];
      return {
        datasetItemId: item.id,
        output: variant.output,
        scores: buildScores(assertions, variant),
        ...simulatedPerf(item.id, row.vars[0] ?? "", variant.output, MODEL),
      };
    });
    results = injectSyntheticError(results, 17, ERROR_NOTE);

    const passRate = computePassRate(results);
    spec.runs = [
      {
        id: newId("run"),
        createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000,
        mode: "live",
        results,
        passRate,
        scope: "full",
        targetId: spec.target.id,
        ranByUserId: ownerId,
      },
    ];
    return spec;
  })();

  // --- Scenario 5: composite/grouped assertions (assert-set) + not-equals/contains-html (1 example, invented) ---
  const s5 = buildScenario5(ownerId);

  return [s1a, s1b, s1c, s2, s3a, s3b, s4, s5];
}
