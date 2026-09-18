import type {
  Assertion,
  AssertionScore,
  Library,
  LibraryAssertion,
  MockUser,
  Prompt,
  RunGroup,
  RunItemResult,
  SpecProject,
} from "./types";
import { createBlankSpec, newExample, newIOField, newOpenQuestion, newRequirement } from "./specFactory";
import { finalizeRun } from "./engine";
import { newId } from "./utils/id";
import { simulatedPerf } from "./pricing";
import { buildDatasetItem } from "./dataset";
import { assertionToLibraryEntry, datasetToLibraryEntry } from "./libraryFactory";
import { mirrorPromptFromSpec } from "./promptFactory";
import { buildScenarioSpecs } from "./seed/scenarioSeeds";

/** Mock users, standing in for real auth — lets Private vs. Org-wide visibility actually be demoed. */
export const USER_VERONICA = "user_veronica";
export const USER_DAN = "user_dan";
export const USER_PRIYA = "user_priya";

/**
 * Cosmetic-only: synthesizes a handful of earlier Runs before the "real" hand-authored one, so the
 * global Runs list (and a Spec's own run-history picker) have more than a single row to browse in
 * the demo. Built by deterministically flipping a few rows' first score and back-dating
 * `createdAt` — not meant to tell a coherent "improved over time" story, just to populate the list
 * with plausible-looking history.
 */
function withSyntheticRunHistory(finalResults: RunItemResult[], daysAgoForEach: number[], targetId: string): RunGroup[] {
  return daysAgoForEach.map((days, i) => {
    const results = finalResults.map((r, j) => {
      const flip = (j + i) % 4 === 0;
      const scores: AssertionScore[] = r.scores.map((s, k) =>
        flip && k === 0 ? { ...s, passed: false, score: s.score !== undefined ? Math.min(s.score, 0.4) : s.score } : s,
      );
      return { ...r, scores };
    });
    const run = finalizeRun(results, "live", "full", targetId, USER_VERONICA);
    return { ...run, createdAt: Date.now() - days * 24 * 60 * 60 * 1000 };
  });
}

export function seedUsers(): MockUser[] {
  return [
    { id: USER_VERONICA, name: "Prompt Hanks", initials: "PH", email: "veronica.kravets@pearl.com" },
    { id: USER_DAN, name: "Eval Presley", initials: "EP", email: "eval.presley@pearl.com" },
    { id: USER_PRIYA, name: "Leonardo DiPromptio", initials: "LD", email: "leonardo.dipromptio@pearl.com" },
  ];
}

// The real, live production system prompt for the "ccheadline" Target — verbatim from
// prompt_ccheadlineaistudio.txt, including its quirks (e.g. the mismatched quote around "free").
// Uses {{Pearl_User_Chat}} (double-brace, the production convention) rather than AI Studio's
// native single-brace {variable} — see promptTemplate.ts, which recognizes both.
const CCHEADLINE_PROMPT = [
  "Read the customer and assistant interaction for context.",
  "",
  "Use the following variables to create a headline based on the chat: Brand (example: Ford, Toyota, etc.)",
  "Model (example: F150, Camry, etc.)",
  "Year (example: 2016, 2022, etc.)",
  "Vehicle (example: SUV, motorcycle, RV, etc.)",
  "Problem (example: starting issue, stuck, need manual, etc.)",
  "Part (example: starter, battery, hood, door, tires)",
  "",
  "IMPORTANT: Use two or three variables in an organic, conversational headline.",
  "Examples:",
  "Get your Toyota RAV4 started again today",
  "Easily fix your Ford SUV's starting problem",
  "Restore cooling in your BMW's AC now",
  "Quickly fix your VW radiator's cooling issue",
  "Keep your mobile home cool and running smoothly",
  "Get your car's AC system working again effortlessly",
  "Start your Toyota without any problems",
  "Fix your Mercedes transmission's shifting issue now",
  "",
  "Adjust the [problem] variable if necessary so that it makes sense in the headline.",
  "",
  'ALWAYS use ONE [problem] issue ONLY. NEVER "[problem] and [problem]".',
  "NEVER use more than TWO words to describe the [problem].",
  "ALWAYS capitalize Brand names (Example: Ford, Toyota, etc.)",
  'NEVER use the words "advice", "consult", "consultation", \'free", "com", or ".com"',
  "ALWAYS use sentence case for the headline.",
  "",
  "IMPORTANT: NEVER use more than 9 words in the headline.",
  "IMPORTANT: NEVER use more than THREE variables in a headline",
  "",
  "Conversation:",
  "{{Pearl_User_Chat}}",
].join("\n");

// The 13 real Pearl_User_Chat transcripts from eval_ccheadlineaistudio.txt's tests[].vars — used
// verbatim, no invented rows. Rows 6-8 contain literal \u0000 characters in the source data itself
// (an apostrophe-encoding glitch upstream, not something introduced here) — kept as-is since the
// point of this fixture is to reflect real production data, warts included.
const CCHEADLINE_CHATS: string[] = [
  "Hi, my Ford F-150 won\u2019t start and the battery is good. Could it be the starter?Hi. Is the engine cranking at all when you turn the key?No, just a click and then nothing.Are the dash lights dimming or staying bright?They stay bright, but the truck still won\u2019t start.Is there anything else the Auto Expert should know before I connect you? Rest assured that they\u2019ll be able to help you.Nothing else.",
  "Hello, my 2022 Toyota Camry AC blows warm air at idle and the cabin never cools down. Could this be the compressor?Hi. Does the AC get colder when you\u2019re driving?Yes, a little, but it\u2019s still not cold enough.Is the fan working normally on all speeds?Yes, the fan is fine, just warm air most of the time.Is there anything else the Auto Expert should know before I connect you? Rest assured that they\u2019ll be able to help you.No, that\u2019s it.",
  "My BMW SUV has a hood latch problem and it won\u2019t open after I pulled the release. I need to check the battery.Hi. Did you hear the latch pop when you pulled the handle?Yes, it popped once, then nothing.Are you able to access the car from the grille area or underneath?No, I can\u2019t get to it that way either.Is there anything else the Auto Expert should know before I connect you? Rest assured that they\u2019ll be able to help you.Just need the hood open.",
  "My 2018 Ford F-150 won\u2019t start after sitting overnight. The battery seems fine, but it just clicks. Is the starter bad?Hi. Did you try a jump start, and are the lights strong?Yes, lights are normal and a jump didn\u2019t helpIs there anything else the Vehicle Expert should know before I connect you?",
  "My 2021 Toyota Camry AC blows warm air on the driver side and cold on the passenger side. Could it be a blend door problem?Hi. Have you checked the cabin temperature settings and refrigerant level?The settings are normal, but I haven\u2019t checked refrigerantIs there anything else the Auto Expert should know before I connect you?",
  "I have a 2016 BMW X5 with a rear door that won\u2019t open from the outside or inside. The child lock isn\u2019t on, so I\u2019m wondering if the latch is stuck.Hi. Does the door handle feel loose or completely normal?It feels normal, but the door stays shutIs there anything else the Car Expert should know before I connect you?",
  "Hi, my 2018 Toyota RAV4 has a starting issue. It clicks but won\u0000t turn over. Could it be the battery or starter?Hi. To help narrow that down, does it happen in park and neutral, and are the lights dim?The lights seem okay, but it still won\u0000t start after sitting overnightIs there anything else the Automotive Expert should know before I connect you? Rest assured that they\u0000ll be able to help you.no, just want to get it running again",
  "Hello, my 2021 Ford F150 truck AC is blowing warm air on the driver side and cold on the passenger side. I need help fastHi. Is the compressor running, and do you hear any clicking from behind the dash?Yes, the compressor seems to cycle, but the air is still mixed and weirdIs there anything else the Automotive Expert should know before I connect you? Rest assured that they\u0000ll be able to help you.only on hot days",
  "Hey, my 2014 BMW X5 has a door problem. The rear door won\u0000t open from the outside, but it opens from inside. Is the latch broken?Hi. Has the child lock been checked, and does the handle feel loose?The handle feels normal, but the door stays stuck unless I pull hard from insideIs there anything else the Automotive Expert should know before I connect you? Rest assured that they\u0000ll be able to help you.need it fixed before school pickup",
  "Hi, my 2018 Ford F150 won\u2019t start after sitting overnight. The battery is new, but it still just clicks when I turn the key. Is there anything else the Automotive Expert should know before I connect you? Rest assured that they\u2019ll be able to help you. It started after I replaced the battery and now the starter seems weak.",
  "hacked facebook accHave you reported this to Facebook?tried having problesHave you ensured your other accounts are safe? Especially if they use the same username or password.yaIs there anything else the Computer Expert should know before I connect you? Rest assured that they'll be able to help you.don't want lose pic of family",
  "Hello, I have a Roland V Grand that I am very satisfied with, but the Value dial for selecting other preset tones, for example, jumps from 001 to 004 or other values. Can I disconnect this dial from the outside to clean it? Kind regards, WillemHi. Is there anything else the Instrument Expert should know before I connect you? Rest assured that they'll be able to help you.Hello, I'm talking about button 9 in the V-Piano Grand manual page 12 (Panel descriptions). Could compressed air be a solution?OK. Got it. I'm sending you to a secure page to join JustAnswer for only 1 \u20ac (fully-refundable). While you're filling out that form, I'll tell the Instrument Technician about your situation and then connect you two.",
  "Hi. I am being asked to varsity my email on the site, but the verification email is not comming into my email adress. I cannot do anything on the siite now. Need to track my orders urgentlyHi. How's your internet connection? Are you checking your email from a browser or a mail client (e.g. Outlook)?I am getting all other emails and my connection is perfectly fineAre there any antivirus or firewall settings that could block you from receiving mail?No antivirus, working only on Apple platformsIs there anything else the Email Expert should know before I connect you? Rest assured that they'll be able to help you.nothing",
];

/**
 * Real Run v1 results from eval-vWC-2026-09-01T18_12_26.json — the actual production headlines
 * and the actual componentResults (pass/score/reason) from all 5 real assertions, in the same
 * order the eval config declares them: organic headline, problem wording, brand capitalization,
 * banned words, word count. Nothing here is simulated.
 */
const CCHEADLINE_RUN_V1: { headline: string; scores: { pass: boolean; score: number; reason: string }[] }[] = [
  {
    headline: "Fix your Ford F-150 starter no crank issue",
    scores: [
      { pass: false, score: 0.3, reason: "The headline 'Fix your Ford F-150 starter no crank issue' sounds somewhat forced and list-like rather than organic and conversational." },
      { pass: false, score: 0, reason: "The phrase 'starter no crank issue' is awkward and not a standard way to describe the problem; a more natural phrasing would be 'no crank starter issue' or 'starter no-crank issue'." },
      { pass: true, score: 1, reason: "The brand name 'Ford' is capitalized correctly in the headline." },
      { pass: true, score: 1, reason: "Assertion passed" },
      { pass: true, score: 1, reason: "Assertion passed" },
    ],
  },
  {
    headline: "Fix your 2022 Toyota Camry AC warm air issue",
    scores: [
      { pass: false, score: 0.3, reason: "The headline 'Fix your 2022 Toyota Camry AC warm air issue' sounds somewhat forced and list-like rather than organic and conversational. It reads more like a direct instruction or a search query than a natural headline." },
      { pass: true, score: 1, reason: "The phrase 'AC warm air issue' is grammatically correct and contextually appropriate for a headline about fixing a car air conditioning problem." },
      { pass: true, score: 1, reason: "The brand name 'Toyota' is correctly capitalized in the headline." },
      { pass: true, score: 1, reason: "Assertion passed" },
      { pass: true, score: 1, reason: "Assertion passed" },
    ],
  },
  {
    headline: "Fix your BMW SUV hood latch problem today",
    scores: [
      { pass: false, score: 0.3, reason: "The headline 'Fix your BMW SUV hood latch problem today' sounds somewhat forced and list-like rather than organic and conversational. It reads more like a direct call to action or advertisement rather than a natural headline discussing the issue." },
      { pass: true, score: 1, reason: "The phrase 'hood latch problem' is grammatical and contextually appropriate for a BMW SUV, making the headline clear and sensible." },
      { pass: true, score: 1, reason: "The brand name 'BMW' is capitalized correctly in the headline." },
      { pass: true, score: 1, reason: "Assertion passed" },
      { pass: true, score: 1, reason: "Assertion passed" },
    ],
  },
  {
    headline: "Fix your 2018 Ford F-150 starter issue today",
    scores: [
      { pass: false, score: 0.3, reason: "The headline 'Fix your 2018 Ford F-150 starter issue today' sounds somewhat forced and list-like rather than organic and conversational. It reads more like a direct call to action or advertisement than a natural headline." },
      { pass: true, score: 1, reason: "The phrase 'starter issue' is grammatically correct and contextually appropriate for a car repair headline." },
      { pass: true, score: 1, reason: "The brand name 'Ford' is correctly capitalized in the headline." },
      { pass: true, score: 1, reason: "Assertion passed" },
      { pass: true, score: 1, reason: "Assertion passed" },
    ],
  },
  {
    headline: "Fix your 2021 Toyota Camry AC temperature issue",
    scores: [
      { pass: false, score: 0.4, reason: "The headline 'Fix your 2021 Toyota Camry AC temperature issue' is straightforward and clear but sounds somewhat forced and list-like rather than organic and conversational. It reads more like an instruction or a title in a manual rather than a natural headline." },
      { pass: true, score: 1, reason: "The phrase 'AC temperature issue' is grammatical and contextually appropriate for a headline about fixing a car's air conditioning problem." },
      { pass: true, score: 1, reason: "The brand name 'Toyota' is capitalized correctly in the headline." },
      { pass: true, score: 1, reason: "Assertion passed" },
      { pass: true, score: 1, reason: "Assertion passed" },
    ],
  },
  {
    headline: "Fix your 2016 BMW X5 rear door latch issue",
    scores: [
      { pass: false, score: 0.3, reason: "The headline 'Fix your 2016 BMW X5 rear door latch issue' sounds somewhat forced and list-like rather than organic and conversational. It reads more like an instruction or a title for a how-to guide rather than a natural headline." },
      { pass: true, score: 1, reason: "The problem phrase 'rear door latch issue' is grammatical and contextually appropriate for the headline about fixing a BMW X5's rear door latch." },
      { pass: true, score: 1, reason: "The brand name 'BMW' is correctly capitalized in the headline." },
      { pass: true, score: 1, reason: "Assertion passed" },
      { pass: true, score: 1, reason: "Assertion passed" },
    ],
  },
  {
    headline: "Get your 2018 Toyota RAV4 starting again",
    scores: [
      { pass: true, score: 1, reason: "The headline 'Get your 2018 Toyota RAV4 starting again' reads naturally and conversationally, addressing the issue directly without sounding forced or list-like." },
      { pass: true, score: 1, reason: "The phrase 'Get your 2018 Toyota RAV4 starting again' is grammatical and contextually appropriate as a headline about fixing a starting problem with the vehicle." },
      { pass: true, score: 1, reason: "The brand name 'Toyota' is capitalized correctly in the headline." },
      { pass: true, score: 1, reason: "Assertion passed" },
      { pass: true, score: 1, reason: "Assertion passed" },
    ],
  },
  {
    headline: "Fix your 2021 Ford F150 AC blowing warm air",
    scores: [
      { pass: false, score: 0, reason: "The headline 'Fix your 2021 Ford F150 AC blowing warm air' sounds forced and list-like rather than organic and conversational." },
      { pass: false, score: 0, reason: "The phrase 'Fix your 2021 Ford F150 AC blowing warm air' is somewhat awkward because it lacks a clear structure; a more natural headline would be 'Fix your 2021 Ford F150 AC that is blowing warm air' or 'Fix your 2021 Ford F150 AC blowing warm air issue'. As is, the problem phrase is not fully grammatical or contextually smooth." },
      { pass: true, score: 1, reason: "The brand name 'Ford' is capitalized correctly in the headline." },
      { pass: true, score: 1, reason: "Assertion passed" },
      { pass: true, score: 1, reason: "Assertion passed" },
    ],
  },
  {
    headline: "Fix your 2014 BMW X5 rear door issue today",
    scores: [
      { pass: false, score: 0.4, reason: "The headline is straightforward and clear but sounds somewhat forced and list-like rather than organic and conversational." },
      { pass: true, score: 1, reason: "The phrase 'rear door issue' is grammatical and contextually appropriate for a car repair headline." },
      { pass: true, score: 1, reason: "The brand name 'BMW' is capitalized correctly in the headline." },
      { pass: true, score: 1, reason: "Assertion passed" },
      { pass: true, score: 1, reason: "Assertion passed" },
    ],
  },
  {
    headline: "Fix your 2018 Ford F150 starter issue today",
    scores: [
      { pass: false, score: 0.3, reason: "The headline 'Fix your 2018 Ford F150 starter issue today' sounds somewhat forced and list-like rather than organic and conversational. It reads more like a direct call to action or advertisement than a natural headline." },
      { pass: true, score: 1, reason: "The phrase 'starter issue' is grammatically correct and contextually appropriate for a headline about fixing a Ford F150 problem." },
      { pass: true, score: 1, reason: "The brand name 'Ford' is correctly capitalized in the headline." },
      { pass: true, score: 1, reason: "Assertion passed" },
      { pass: true, score: 1, reason: "Assertion passed" },
    ],
  },
  {
    headline: "Recover your hacked Facebook account safely today",
    scores: [
      { pass: false, score: 0.4, reason: "The headline is straightforward and clear but sounds somewhat promotional and forced rather than organic and conversational." },
      { pass: true, score: 1, reason: "The phrase 'hacked Facebook account' is grammatical and contextually appropriate in the headline." },
      { pass: true, score: 1, reason: "The brand name 'Facebook' is capitalized correctly in the headline." },
      { pass: true, score: 1, reason: "Assertion passed" },
      { pass: true, score: 1, reason: "Assertion passed" },
    ],
  },
  {
    headline: "Fix your Roland V Grand value dial issue easily",
    scores: [
      { pass: false, score: 0.4, reason: "The headline is straightforward and clear but sounds somewhat forced and list-like rather than organic and conversational." },
      { pass: false, score: 0, reason: "The phrase 'Roland V Grand value dial issue' is somewhat awkward and unclear; it would be more natural to say 'Roland V-Grand value dial issue' or 'Roland V-Grand's value dial issue'. As is, the problem wording is not fully grammatical or contextually smooth." },
      { pass: true, score: 1, reason: "The brand name 'Roland' is capitalized correctly in the headline." },
      { pass: true, score: 1, reason: "Assertion passed" },
      { pass: true, score: 1, reason: "Assertion passed" },
    ],
  },
  {
    headline: "Fix your email verification issue quickly",
    scores: [
      { pass: false, score: 0, reason: "The headline 'Fix your email verification issue quickly' sounds more like a direct command or list-like instruction rather than a natural, conversational headline." },
      { pass: true, score: 1, reason: "The phrase 'email verification issue' is grammatical and contextually appropriate in the headline." },
      { pass: true, score: 1, reason: "No brand names are present in the headline, so the capitalization rule does not apply." },
      { pass: true, score: 1, reason: "Assertion passed" },
      { pass: true, score: 1, reason: "Assertion passed" },
    ],
  },
];

/**
 * The one and only seed Spec: a real, live production artifact ("ccheadline" — generates the
 * short problem-summary headline shown elsewhere in the product, e.g. a ticket/queue label, from
 * a Pearl chat transcript). Sourced verbatim from three real files (spec, prompt, eval config) plus
 * one real Run v1 result set — nothing here is invented, including its rough edges. AI Studio ships
 * with only this one Spec so the "generate everything from a Spec, then iterate on real results"
 * happy path can be polished end-to-end against a single, real, non-trivial case.
 */
export function buildCcheadlineSpec(): SpecProject {
  let spec = createBlankSpec("Conversational Chat Headline", USER_VERONICA, "org");
  // Real Prompt Management project id this Spec's mirrored Prompt corresponds to — see
  // `SpecProject.psProjectId`. Distinct from `spec.id`, which is only an AI Studio-internal key.
  spec.psProjectId = 4128;

  // Requirements — a flat list, no guardrail/criteria split (that split proved artificial against
  // real Spec documents). rSingleProblem, rNoConjunctions, rVariableCount, and rSentenceCase
  // deliberately have NO matching assertion below — see the openQuestions further down. This
  // isn't a mistake to "fix" here; it's a faithful reflection of what's actually shipped and
  // graded in production today. rSentenceCase used to have one (a regex check, requirementId 972)
  // until it was removed for actively contradicting the spec (it enforced Title Case) — that
  // removal was correct, but it leaves sentence case with zero coverage now, not fixed coverage.
  const rSingleProblem = newRequirement(
    "Only one problem/issue may be used in the headline; if multiple problems are present, select or condense to the single most relevant one.",
    "Single problem only",
  );
  const rNoConjunctions = newRequirement(
    'Must not join problem phrases with "and" or other conjunctions — exactly one problem issue only.',
    "No conjunctions",
  );
  const rBannedWords = newRequirement(
    'Must never contain "advice", "consult", "consultation", "free", "com", or ".com" (or variations).',
    "No banned words",
  );
  const rHeadlineLength = newRequirement("Headline must not exceed nine words.", "Max 9 words");
  const rVariableCount = newRequirement(
    "Headline must include exactly two or three variables from brand/model/year/vehicle/problem/part.",
    "2-3 variables",
  );
  const rProblemAdjustment = newRequirement(
    "If the problem description is longer than two words, truncate to the most relevant two-word phrase.",
    "Truncate long problem",
  );
  const rBrandCapitalization = newRequirement("Brand names must be capitalized as proper nouns.", "Capitalize brand");
  const rHeadlineStyle = newRequirement(
    "Headline must read as a natural, organic, conversational phrase, not a mechanical listing.",
    "Organic tone",
  );
  const rOptionalInputs = newRequirement(
    "Year, model, part, and vehicle are optional — gracefully omit them from the headline when empty/missing.",
    "Optional fields omitted gracefully",
  );
  const rSentenceCase = newRequirement(
    "Headline must use sentence case — only the first word and proper nouns capitalized.",
    "Sentence case",
  );

  spec = {
    ...spec,
    goal:
      "Generate a natural, conversational headline that accurately summarizes the customer's problem from a Pearl chat transcript, using two or three input variables, obeying all stylistic and content rules, resulting in a concise headline of no more than nine words.",
    context:
      "Generated headlines are shown elsewhere in the product as a ticket/queue label summarizing the customer's problem at a glance, so support staff can triage without re-reading the full chat.",
    inputFields: [
      {
        ...newIOField("Pearl_User_Chat", "string"),
        description: "The full Pearl chat transcript (customer + assistant turns).",
      },
    ],
    outputFields: [
      {
        ...newIOField("headline", "string"),
        description:
          "A single headline string — sentence case, no more than nine words, no banned words, with any brand name used capitalized correctly.",
      },
    ],
    outputMode: "text",
    requirements: [
      rSingleProblem,
      rNoConjunctions,
      rBannedWords,
      rHeadlineLength,
      rVariableCount,
      rProblemAdjustment,
      rBrandCapitalization,
      rHeadlineStyle,
      rOptionalInputs,
      rSentenceCase,
    ],
    openQuestions: [
      newOpenQuestion(
        "The Examples below carry structured brand/model/year/vehicle/problem/part fields from the " +
          "original spec document, but the real production Target (Prompt tab) only ever receives " +
          "Pearl_User_Chat — the model infers brand/model/problem/etc. from the chat text itself. Should " +
          "the Examples be rewritten to drop the field annotations and match what the Target actually " +
          "receives, or is the structured breakdown still useful context for whoever edits this Spec?",
      ),
      newOpenQuestion(
        '"Sentence case" (see Requirements) has zero assertion coverage today — a draft heuristic ' +
          "replacement already exists in the Library (private, not yet pinned in). Is a rough heuristic " +
          "good enough here, or does this need real judge coverage instead?",
      ),
      newOpenQuestion(
        '"Single problem only" and "No conjunctions" also have no assertion coverage — is the "Organic ' +
          'tone" rubric catching these implicitly (a multi-problem, conjunction-joined headline would ' +
          "probably also read as unnatural), or do they need their own explicit check?",
      ),
    ],
    examples: [
      newExample(
        "Pearl_User_Chat: \"User: I'm having trouble starting my Toyota RAV4.\nAssistant: Let's try some quick checks to get it running.\"",
        "Get your Toyota RAV4 started again today",
      ),
      newExample(
        "Pearl_User_Chat: \"User: My Ford SUV won't start.\nAssistant: Have you checked the battery connections?\"",
        "Easily fix your Ford SUV's starting problem",
      ),
      newExample(
        "Pearl_User_Chat: \"User: The AC in my BMW is not cooling.\nAssistant: Let's check the cooling system settings and filters.\"",
        "Restore cooling in your BMW's AC now",
      ),
      newExample(
        "Pearl_User_Chat: \"User: My Facebook account was hacked.\nAssistant: Have you reported this to Facebook and changed your password?\"",
        "Recover your hacked Facebook account safely today",
      ),
      newExample(
        "Pearl_User_Chat: \"User: My Mercedes car is having trouble shifting gears.\nAssistant: We should inspect the transmission fluid levels first.\"",
        "Fix your Mercedes transmission's shifting issue now",
      ),
      newExample(
        "Pearl_User_Chat: \"User: My Ford SUV won't start and the AC is also not cooling.\nAssistant: Let's focus on the starting problem first to get you moving.\"",
        "Easily fix your Ford SUV's starting problem",
        "Two problems are present (starting AND cooling) — \"Single problem only\" means we pick the more urgent one (starting) rather than combining both.",
      ),
      newExample(
        "Pearl_User_Chat: \"User: I'm asked to verify my email but the verification email never arrives.\nAssistant: Are you checking your inbox and spam folder? Is your internet connection stable?\"",
        "Fix your email verification issue to track orders easily",
        "No vehicle/brand involved at all — the same generator handles non-automotive JustAnswer categories using the same problem-summary pattern.",
      ),
      newExample(
        "Pearl_User_Chat: \"User: I need the manual for my product.\nAssistant: I can help you find the manual quickly.\"",
        "Get your manual quickly and easily",
        "No brand, model, or vehicle info available at all — optional fields (\"Optional fields omitted gracefully\") are simply dropped rather than leaving placeholder text.",
      ),
      newExample(
        "Pearl_User_Chat: \"User: My Roland V Grand's value dial skips numbers.\nAssistant: You may want to clean the dial carefully to resolve the issue.\"",
        "Fix your Roland V Grand value dial issue easily",
      ),
    ],
    access: [{ userId: USER_DAN, role: "editor" }],
    // Mocked adoption metadata — in production, sourced from real Dynatrace/LiteLLM telemetry.
    // Last touched by Dan (not the owner) so the "Last updated by" column has something to show.
    updatedByUserId: USER_DAN,
    appliedFeature: "CC Headline",
    // Executions >> fetches: a fetch is cached by the caller and reused across many production
    // calls, so one fetch typically backs many executions — never the other way around.
    usageStats: { windowHours: 24, promptFetches: 482, productionExecutions: 21347 },
  };

  // The real, currently-shipped eval config has exactly 5 assertions — mapped 1:1 from
  // eval_ccheadlineaistudio.txt's assert[]. Deliberately hand-built rather than run through the
  // auto-classifier: this is the actual production eval, not a freshly-generated draft, and
  // preserving its real coverage gaps (see comments above) is the whole point of this fixture.
  const aOrganicHeadline: Assertion = {
    id: newId("assert"),
    sourceRequirementId: rHeadlineStyle.id,
    tier: "rubric_grading",
    description: "Write an organic headline",
    rubric:
      "Create an organic, conversational headline. The headline should read like a natural headline for the issue and should not sound forced or list-like.",
    group: "Style & wording",
  };
  const aProblemWording: Assertion = {
    id: newId("assert"),
    sourceRequirementId: rProblemAdjustment.id,
    tier: "rubric_grading",
    description: "Adjust problem wording",
    rubric:
      "Adjust the Problem variable if necessary so it makes sense in the headline. Pass if the problem wording is grammatical and contextually appropriate in the final headline; fail if the problem phrase is awkward or nonsensical.",
    group: "Style & wording",
  };
  const aBrandCapitalization: Assertion = {
    id: newId("assert"),
    sourceRequirementId: rBrandCapitalization.id,
    tier: "rubric_grading",
    description: "Capitalize brand names",
    rubric:
      "Capitalize brand names. Pass if any brand name used in the headline is capitalized correctly; fail if a brand name appears in lowercase or mixed case.",
    group: "Formatting",
  };
  // Real check type is promptfoo's `not-contains-any` over a literal word list — matches exactly
  // now that the deterministic catalog has a native mode for it (case-insensitive variant, since
  // the real eval doesn't care about casing of these words).
  const aBannedWords: Assertion = {
    id: newId("assert"),
    sourceRequirementId: rBannedWords.id,
    tier: "deterministic",
    description: "Forbid banned words (advice / consult / consultation / free / com / .com)",
    check: { mode: "not_icontains_any", value: "advice, consult, consultation, free, .com" },
    group: "Guardrails",
  };
  // Real check type is promptfoo's `word-count` (max: 9) — matches exactly now that the
  // deterministic catalog has a native mode for it, instead of a custom_code approximation.
  const aHeadlineLength: Assertion = {
    id: newId("assert"),
    sourceRequirementId: rHeadlineLength.id,
    tier: "deterministic",
    description: "Limit headline length to 9 words or fewer",
    check: { mode: "word_count", value: "", max: 9 },
    group: "Formatting",
  };

  spec.assertions = [aOrganicHeadline, aProblemWording, aBrandCapitalization, aBannedWords, aHeadlineLength];

  // Not specified in the real eval config (promptfoo's default grading provider was used, no
  // explicit judge system prompt) — AI Studio's own reasonable default, flagged as inferred.
  spec.judge = { id: newId("judge"), model: "gpt-4o-mini" };

  spec.target = {
    id: newId("target"),
    // Real config: "openai/gpt-4.1-mini-2025-04-14" (provider-prefixed); normalized here to match
    // how every other seed Target names a model (no provider prefix).
    model: "gpt-4.1-mini-2025-04-14",
    temperature: 0,
    status: "published",
    createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
    promptContent: CCHEADLINE_PROMPT,
    // A single system message, exactly matching the real production config's shape (no separate
    // human "{input}" turn) — this is what makes the live Playground run send {{Pearl_User_Chat}}
    // through variable substitution instead of a hardcoded second turn. The real config's
    // max_completion_tokens/presence_penalty/seed values weren't recorded when this was captured,
    // so `settings` is left at its defaults here even though `TargetVersion` now models it.
    messages: [{ id: newId("msg"), role: "system", content: CCHEADLINE_PROMPT }],
    // Real Prompt Management version id for this exact published version — see `TargetVersion.psVersionId`.
    psVersionId: 24391,
  };

  spec.dataset = CCHEADLINE_CHATS.map((chat) => buildDatasetItem({ Pearl_User_Chat: chat }, ["Pearl_User_Chat"], "manual"));

  const results: RunItemResult[] = spec.dataset.map((item, i) => {
    const row = CCHEADLINE_RUN_V1[i];
    const scores: AssertionScore[] = [aOrganicHeadline, aProblemWording, aBrandCapitalization, aBannedWords, aHeadlineLength].map(
      (assertion, j) => ({
        assertionId: assertion.id,
        passed: row.scores[j].pass,
        reason: row.scores[j].reason,
        score: row.scores[j].score,
      }),
    );
    return {
      datasetItemId: item.id,
      output: row.headline,
      scores,
      ...simulatedPerf(item.id, item.input, row.headline, spec.target!.model),
    };
  });

  // Flags the row as an example of the run's dominant failure pattern — 8 of 13 generated
  // headlines literally start with "Fix your...", a repetitive template the model settled on that
  // "Write an organic headline" is catching (scores 0-0.4 on 10 of 13 rows). Tightening the
  // Target's phrasing guidance/examples to break this pattern is the natural first fix to try.
  results[0].labels = ["repetitive-pattern"];

  // 24 back-dated rows (every 3 days back to ~10 weeks) + the "real" final run, so the global
  // Eval runs list has enough rows across both Specs to actually need pagination, not just a
  // single page of 8 — see `withSyntheticRunHistory`.
  const ccheadlineHistoryDaysAgo = Array.from({ length: 24 }, (_, i) => (i + 1) * 3);
  spec.runs = [
    ...withSyntheticRunHistory(results, ccheadlineHistoryDaysAgo, spec.target.id),
    finalizeRun(results, "live", "full", spec.target.id, spec.ownerId),
  ];
  return spec;
}

// The real, live production system+user messages for the "CQA pricing help" Target — verbatim
// from CQA-prompt.txt, warts included (e.g. "Justnaswer" typo, the two-space "== K-shot ==" gap).
// Uses {{Conversation}} (capital C), the real Target's actual variable name — distinct from this
// Spec's own documented input field name "conversation" (lowercase), see the openQuestion below.
const CQA_SYSTEM_PROMPT =
  "== Context ==\nJustAnswer is a subscription-based service that connects customers with specialized experts to answer their questions across a wide range of fields, including law, medicine, vehicle repair, technology, home repair, finance, and more. Customers start by submitting their questions, and the platform matches them with the appropriate Expert who can provide a detailed and personalized response in interactive support experience in a page called CQA. The Expert is expected to help the customer with a diagnosis, or direct answer, provide links, provide manual or instructions to troubleshoot, or next staps. Note that, the Expert is NOT expected to provide customer support with respect to Justanswer service membership or refunds.\n\n== Role ==\nRead the conversation for context and grade conversation as true or false based on function below.\n\nIMPORTANT: True ONLY IF the customers makes a direct reference to Justanswer membership fee, supported by word like 'you'. False if cost issue is regarding non-Justnaswer service or vendor like Uber, Amazon, passport, mail, hospital, clinic etc. Pay close attention to the context for mention of a company, referencing words like 'they'. Also false if the discussion is regarding follow-up or additional services like document review.\n\n== K-shot ==\n\"I want my money back\" - true\n\"why did you charge me $55\" -true\n\"The $85 you mentioned is for the biometrics fee\" - false\n\"They just send me another bill.\" - false\n\n== Output format example ==\ntrue\nfalse";
const CQA_USER_PROMPT = "CQA conversation so far:{{Conversation}}";

/**
 * 13 real conversations from cqa-evals.txt's tests[].vars, chosen to span both classes (true/false)
 * and a wide mix of non-automotive JustAnswer categories (tax, medical, vet, legal, appliance,
 * tech) — plus one clearly-labeled synthetic row appended after, to exercise the failing-row
 * review flow (every one of the 45 real rows in the source file actually passed).
 */
const CQA_CONVERSATIONS: { conversation: string; pricingHelp: boolean }[] = [
  {
    conversation:
      "Customer: Hi, I have a question about my 2018 Honda Accord\nExpert: Hello! I'm Mike, a certified mechanic. I'd be happy to help with your Honda. What seems to be the issue?\nCustomer: wait before we continue, I just noticed a charge on my credit card for $46 from you guys\nCustomer: I thought this was supposed to be free??\nExpert: I understand your concern. I'm here to help with your vehicle question, but for billing matters you'd need to contact JustAnswer's customer support team.\nCustomer: no I want my money back first before anything else",
    pricingHelp: true,
  },
  {
    conversation:
      "Customer: my toilet is making a gurgling noise when I flush\nExpert: Hi there! I'm a licensed plumber. That gurgling usually indicates a venting issue. Is it just the one toilet or multiple fixtures?\nCustomer: just the one in the master bathroom\nExpert: Ok, that helps narrow it down. Have you noticed any slow draining?\nCustomer: actually hold on - why did you charge me $55??? I only agreed to pay $5 for this question!",
    pricingHelp: true,
  },
  {
    conversation:
      "Customer: Need help with Windows 11 update problem\nExpert: Hi, I'm a certified tech. What's happening with your update?\nCustomer: it keeps failing at 47%\nExpert: Let's try a few things. First, can you run the Windows Update troubleshooter?\nCustomer: before we do that - can you explain why there's a $50 subscription on my bank statement from justanswer? I didnt sign up for that\nExpert: I apologize for any confusion but I'm only able to assist with technical questions. You'll need to reach out to customer service for billing issues.\nCustomer: this is ridiculous. I want a refund immediately",
    pricingHelp: true,
  },
  {
    conversation:
      "Customer: Question about my dog's behavior\nExpert: Hello! I'm Dr. Sarah, a veterinarian. What's going on with your pup?\nCustomer: she keeps scratching her ear\nExpert: How long has this been happening? Any discharge or odor?\nCustomer: about a week. no smell that i notice\nExpert: It could be an ear infection or allergies. I'd recommend...\nCustomer: sorry to interrupt but i just checked my email and saw you billed me $46?? why did you charge my card without permission",
    pricingHelp: true,
  },
  {
    conversation:
      "Customer: I have a tax question about home office deduction\nExpert: Hi, I'm a CPA with 15 years experience. Happy to help with your tax question!\nCustomer: actually nevermind the tax question. I need to know how to cancel this membership you signed me up for\nCustomer: I never agreed to $55/month\nExpert: I understand your frustration. Unfortunately, I can only help with tax-related questions. For membership issues please contact JustAnswer support.\nCustomer: this is a scam. give me back my money",
    pricingHelp: true,
  },
  {
    conversation:
      "Customer: hi i have chest pain should i be worried\nExpert: Hello, I'm Dr. James. Chest pain can have many causes. Can you describe the pain - is it sharp, dull, constant?\nCustomer: its like a pressure feeling\nExpert: How long have you had this? Any shortness of breath?\nCustomer: couple hours. no trouble breathing\nCustomer: hey wait a minute why does my bank show a pending charge of $55 from this website??\nCustomer: i only paid $1 to ask this question!",
    pricingHelp: true,
  },
  {
    conversation:
      "Customer: i need help with my iphone\nExpert: Hi there! What's going on with your iPhone?\nCustomer: the screen is frozen and wont turn off\nExpert: Have you tried a force restart? Hold the volume up button, then volume down, then hold the side button until you see the Apple logo.\nCustomer: ok trying now\nCustomer: it worked! thanks\nExpert: Great! Is there anything else I can help you with?\nCustomer: no thats it",
    pricingHelp: false,
  },
  {
    conversation:
      "Customer: my dog has been vomiting for 2 days\nExpert: I'm sorry to hear that. How old is your dog and what breed?\nCustomer: shes a 4 year old lab mix\nExpert: Has she eaten anything unusual recently? Any changes in diet or getting into trash?\nCustomer: not that i know of but she does get into things sometimes\nExpert: Is she still drinking water? And how frequent is the vomiting?\nCustomer: she drinks a little. vomits maybe 3-4 times a day\nExpert: I'd recommend withholding food for 12 hours but keeping water available. If she can't keep water down or shows signs of lethargy, she should see a vet today.\nCustomer: ok thank you. they quoted me $200 for an exam at the emergency vet, is that normal?",
    pricingHelp: false,
  },
  {
    conversation:
      "Customer: I need to know about eviction laws in Texas\nExpert: I'd be happy to help with Texas eviction law. Are you a landlord or tenant?\nCustomer: tenant. my landlord is trying to evict me but didnt give proper notice\nExpert: In Texas, landlords must provide written notice before filing for eviction. What type of notice did you receive, if any?\nCustomer: just a text message saying i have 3 days to leave\nExpert: A text message alone is generally not sufficient legal notice in Texas. The landlord typically must provide written notice that meets specific requirements.",
    pricingHelp: false,
  },
  {
    conversation:
      "Customer: My Amazon order never arrived and they won't refund me\nExpert: I'm sorry to hear about that frustrating situation. How long ago was the order supposed to arrive?\nCustomer: 2 weeks ago. they keep saying it was delivered but I never got it\nExpert: Have you checked with neighbors or your building's package room? Sometimes carriers mark items delivered before actual delivery.\nCustomer: yes checked everywhere. they charged me $89 and won't give it back\nExpert: I'd recommend filing a claim through Amazon's A-to-Z Guarantee program. You can also dispute the charge with your credit card company if Amazon won't help.",
    pricingHelp: false,
  },
  {
    conversation:
      "Customer: Question about my Toyota Camry\nExpert: Hi! What's going on with your Camry?\nCustomer: The AC stopped blowing cold air\nExpert: When did you first notice this? And does it blow warm air, or no air at all?\nCustomer: warm air. started about a week ago\nExpert: This could be a refrigerant leak or a failing compressor. First, I'd recommend having the refrigerant level checked. Many shops offer free AC checks.\nCustomer: how much does that cost usually\nExpert: Most shops charge between $100-$200 just to diagnose the issue. Repair costs depend on what they find.",
    pricingHelp: false,
  },
  {
    conversation:
      "Customer: I need help understanding my hospital bill\nExpert: I can try to help explain medical billing. What specifically are you confused about?\nCustomer: they charged me $500 for a 10 minute visit and that seems way too high\nExpert: Hospital billing can be complex. The $500 likely includes facility fees, not just the doctor's time. Do you have the itemized bill?\nCustomer: yes it says facility fee $300, physician fee $150, supplies $50\nExpert: That breakdown is actually pretty standard for a hospital visit. The facility fee covers overhead, equipment, and support staff even for short visits.",
    pricingHelp: false,
  },
  {
    conversation:
      "Customer: need help with QuickBooks\nExpert: I can help with QuickBooks. What issue are you experiencing?\nCustomer: i cant get my bank feed to connect\nExpert: Which bank are you trying to connect? And what error message are you seeing?\nCustomer: chase bank. it says connection failed\nExpert: Chase recently updated their security protocols. Try removing the existing connection and re-adding it. You'll need to log into Chase directly and authorize the connection again.\nCustomer: ok let me try\nCustomer: that worked! thank you so much",
    pricingHelp: false,
  },
];

/**
 * The one synthetic row in this Spec's seed dataset (`source: "synthetic"`, unlike the 13 real
 * rows above from `source: "manual"`) — every one of the 45 real rows in cqa-evals.txt actually
 * passed (see eval-A7J-2026-05-26T12_17_05.csv, 100% PASS), so a deliberately tricky row is added
 * here to demonstrate reviewing/promoting a failing case, matching the exact ambiguous-"they"
 * failure mode the system prompt's own K-shot examples warn about.
 */
const CQA_SYNTHETIC_CONVERSATION =
  "Customer: My photo restoration order got messed up.\nExpert: I'm sorry to hear that — can you tell me what went wrong with the restoration?\nCustomer: They also charged my card twice for it, I only agreed to one payment.\nExpert: Let's sort out the restoration issue first — do you have the order confirmation?\nCustomer: Yeah, one sec.";

/**
 * A second real, live production artifact ("CQA pricing help" — classifies whether a CQA chat
 * turn is actually about the JustAnswer membership fee/refund, as opposed to some other cost the
 * customer mentioned) — sourced verbatim from CQA-spec.txt, CQA-prompt.txt, and cqa-evals.txt,
 * plus the real eval-A7J run's per-row pass data. A deliberately different shape of Spec from
 * ccheadline: a boolean classifier via a forced tool call, not free-text generation — exercises
 * `outputMode: "tool_call"` and the golden-answer-style eval that comes with a classifier.
 */
export function buildCqaSpec(): SpecProject {
  let spec = createBlankSpec("CQA Pricing/Refund Detection", USER_PRIYA, "org");
  // Real Prompt Management project id this Spec's mirrored Prompt corresponds to — see
  // `SpecProject.psProjectId`. Distinct from `spec.id`, which is only an AI Studio-internal key.
  spec.psProjectId = 4256;

  const rTrueCriteria = newRequirement(
    "Classify as true ONLY if the customer explicitly references the JustAnswer membership fee, supported by words like 'you' (indicating direct address to JustAnswer).",
    "True classification criteria",
  );
  const rFalseOtherCosts = newRequirement(
    "Classify as false if the cost issue relates to other services or vendors such as Uber, Amazon, passport, mail, hospital, clinic, or similar.",
    "False: non-JustAnswer costs",
  );
  const rFalseFollowUp = newRequirement(
    "Classify as false if the discussion concerns follow-up or additional services like document review, not related to JustAnswer membership fees.",
    "False: follow-up/additional services",
  );
  const rOutputFormat = newRequirement(
    "Output must include a boolean classification and the original conversation text under 'cqaConversationSoFar'.",
    "Output format",
  );

  spec = {
    ...spec,
    goal:
      "Determine whether a customer's statement refers directly to the JustAnswer membership fee, classifying the conversation as true or false accordingly.",
    context:
      "JustAnswer is a subscription-based service connecting customers with specialized experts who provide detailed, personalized responses to customer inquiries. Experts do not handle questions about JustAnswer membership fees or refunds themselves — this classifier flags conversations that need to be routed there instead. It's true only if the customer explicitly references the JustAnswer membership fee; false if the cost-related discussion concerns other services, vendors, or follow-up/additional services.",
    inputFields: [
      {
        ...newIOField("conversation", "string"),
        description: "The full conversation between the customer and the expert so far, read for context to determine classification.",
      },
    ],
    // Real production output: a single forced tool call (your_func_1) returning one boolean field
    // — see the openQuestion below about how this differs from this Spec's own outputSchema.
    outputFields: [
      {
        ...newIOField("pricing_help", "boolean"),
        description: "True only if the customer clearly asks a question or complains about JustAnswer pricing or refund; false otherwise.",
      },
    ],
    outputMode: "tool_call",
    outputToolName: "your_func_1",
    requirements: [rTrueCriteria, rFalseOtherCosts, rFalseFollowUp, rOutputFormat],
    openQuestions: [
      newOpenQuestion(
        "This Spec's original design (see \"Output format\" above) described a two-field output — a boolean " +
          "classification plus the original conversation text under cqaConversationSoFar — and an input field " +
          "named \"conversation\". The real production Target instead returns a single boolean (pricing_help) " +
          "via a forced tool call, and reads its input as {{Conversation}} (capital C). The Input/Output " +
          "contracts above have been aligned to match what's actually live; should the original two-field " +
          "output design be revived, or is the simplified single-boolean shape final?",
      ),
      newOpenQuestion(
        "The real production eval grades each row with an exact equality check (output.pricing_help === the " +
          "row's known-correct answer) — a golden-answer comparison. AI Studio's assertion model doesn't yet " +
          "let a deterministic or custom-code check see a dataset row's own expectedOutput (only the output " +
          "itself), so \"Correct pricing/refund classification\" below is a rubric asking the judge to " +
          "re-derive the right answer from the Requirements instead of comparing to a stored one. Same intent, " +
          "different mechanism — worth adding native expected-output comparison for classifier-style Specs " +
          "like this one.",
      ),
    ],
    examples: [
      newExample(
        '"I want my money back"',
        "true",
        "Customer explicitly requests refund, implying reference to JustAnswer membership fees - classified true.",
      ),
      newExample(
        '"why did you charge me $55"',
        "true",
        "Customer directly asks 'you' about a charge, indicating JustAnswer membership fee - classified true.",
      ),
      newExample(
        '"The $85 you mentioned is for the biometrics fee"',
        "false",
        "Cost is for biometrics fee, not JustAnswer membership - classified false.",
      ),
      newExample(
        '"They just sent me another bill."',
        "false",
        "'They' references another company, not JustAnswer - classified false.",
      ),
    ],
    access: [{ userId: USER_VERONICA, role: "editor" }],
    updatedByUserId: USER_PRIYA,
    appliedFeature: "CQA (Chat Q&A)",
    usageStats: { windowHours: 24, promptFetches: 1180, productionExecutions: 58940 },
  };

  const aClassification: Assertion = {
    id: newId("assert"),
    sourceRequirementId: rTrueCriteria.id,
    tier: "rubric_grading",
    description: "Correct pricing/refund classification",
    rubric:
      "Given the conversation and this Spec's classification rules (true only if the customer explicitly references the JustAnswer membership fee, e.g. via 'you'; false if the cost concerns another vendor/service, or a follow-up/additional service), determine the correct pricing_help value, then check whether the output's pricing_help matches it.",
    group: "Classification",
  };
  const aOutputShape: Assertion = {
    id: newId("assert"),
    sourceRequirementId: rOutputFormat.id,
    tier: "deterministic",
    description: "Tool call returns a boolean pricing_help field",
    check: { mode: "contains", value: '"pricing_help"' },
    group: "Formatting",
  };
  spec.assertions = [aClassification, aOutputShape];

  spec.judge = { id: newId("judge"), model: "gpt-4o-mini" };

  spec.target = {
    id: newId("target"),
    model: "gpt-4o-2024-08-06",
    temperature: 0,
    status: "published",
    createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
    promptContent: CQA_SYSTEM_PROMPT,
    // Real Prompt Management version id for this exact published version — see `TargetVersion.psVersionId`.
    psVersionId: 24793,
    messages: [
      { id: newId("msg"), role: "system", content: CQA_SYSTEM_PROMPT },
      { id: newId("msg"), role: "human", content: CQA_USER_PROMPT },
    ],
    tools: [
      {
        id: newId("tool"),
        name: "your_func_1",
        description: "",
        parameters: JSON.stringify(
          {
            type: "object",
            properties: {
              pricing_help: {
                type: "boolean",
                description: "True only if user clearly asks a question or complains about Justanswer pricing or refund. False otherwise",
              },
            },
            required: ["pricing_help"],
          },
          null,
          2,
        ),
      },
    ],
    settings: { maxTokens: 100, presencePenalty: 0.6, seed: 0 },
  };

  spec.dataset = [
    ...CQA_CONVERSATIONS.map((c) =>
      buildDatasetItem({ Conversation: c.conversation }, ["Conversation"], "manual", String(c.pricingHelp)),
    ),
    buildDatasetItem({ Conversation: CQA_SYNTHETIC_CONVERSATION }, ["Conversation"], "synthetic", "false"),
  ];

  const results: RunItemResult[] = spec.dataset.map((item, i) => {
    const isSynthetic = i === CQA_CONVERSATIONS.length;
    const expected = CQA_CONVERSATIONS[i]?.pricingHelp ?? false;
    // The one synthetic row is deliberately misclassified — see the comment on
    // CQA_SYNTHETIC_CONVERSATION above.
    const modelSaid = isSynthetic ? true : expected;
    const output = JSON.stringify({ pricing_help: modelSaid });
    const classificationPassed = modelSaid === expected;
    const scores: AssertionScore[] = [
      {
        assertionId: aClassification.id,
        passed: classificationPassed,
        reason: classificationPassed
          ? "All assertions passed"
          : "Incorrectly classified as JustAnswer billing — 'they' refers to the photo restoration vendor's double charge, not JustAnswer's membership fee (see \"False: non-JustAnswer costs\" / the system prompt's own warning about words like 'they').",
        score: classificationPassed ? 1 : 0,
      },
      {
        assertionId: aOutputShape.id,
        passed: true,
        reason: "Output includes a boolean pricing_help field, as required.",
        score: 1,
      },
    ];
    return {
      datasetItemId: item.id,
      output,
      scores,
      ...simulatedPerf(item.id, item.input, output, spec.target!.model),
    };
  });

  // Not from the real July eval run (every one of the 45 real rows there passed) — added to
  // exercise the failing-row review flow. It reproduces the exact ambiguous-"they" failure mode
  // the system prompt's own K-shot examples warn about, just with a different vendor (a
  // photo-restoration order instead of a biometrics fee).
  results[results.length - 1].labels = ["ambiguous-pronoun"];

  // 24 back-dated rows (every 2 days back to ~7 weeks) + the "real" final run — see the matching
  // comment in `buildCcheadlineSpec` for why this list got longer than a single history point.
  const cqaHistoryDaysAgo = Array.from({ length: 24 }, (_, i) => (i + 1) * 2);
  spec.runs = [
    ...withSyntheticRunHistory(results, cqaHistoryDaysAgo, spec.target.id),
    finalizeRun(results, "live", "full", spec.target.id, spec.ownerId),
  ];
  return spec;
}

export function seedSpecs(): SpecProject[] {
  // Only the numbered Scenario 1-5 specs are seeded here (see the header comment in
  // scenarioSeeds.ts — Scenarios 1-4 are CSV-backed, Scenario 5 is fully invented to cover
  // assert-set/not-equals/contains-html) — "Conversational Chat Headline" and "CQA Pricing/Refund
  // Detection" are a separate, pre-existing Assistant-chat demo (not built from Veronica's
  // Results-page CSVs, not one of the numbered Scenarios), so they're kept out of the initial
  // Home/Eval-runs list to reduce noise. `buildCcheadlineSpec`/`buildCqaSpec` are still used
  // directly by the Assistant's scripted demo flows (see assistantCcheadlineDemo.ts /
  // assistantCqaDemo.ts) and by `seedLibrary` below, so they aren't dead code.
  return buildScenarioSpecs(USER_VERONICA);
}

/**
 * Seed the Library with entries derived from the one real seed Spec — real checks that are
 * actually pinned into it, plus a couple of draft/experimental entries inspired by the real gaps
 * and failure pattern Run v1 surfaced (not yet pinned into the Spec), so the Private vs. Org-wide
 * visibility filter and the "draft in Library, not yet applied" state are both demonstrable
 * immediately, without inventing an unrelated scenario.
 */
export function seedLibrary(): Library {
  const spec = buildCcheadlineSpec();
  const aOrganic = spec.assertions.find((a) => a.description === "Write an organic headline")!;
  const aBanned = spec.assertions.find((a) => a.description.startsWith("Forbid banned words"))!;
  const aLength = spec.assertions.find((a) => a.description.startsWith("Limit headline length"))!;

  const organicHeadlineEntry = {
    ...assertionToLibraryEntry(aOrganic, spec, {
      name: "Organic, conversational headline style",
      description: "LLM-rubric check that a generated headline reads naturally rather than as a mechanical, list-like phrase.",
      tags: ["ccheadline", "style", "rubric"],
      visibility: "org",
      ownerId: USER_VERONICA,
    }),
    usageCount: 3,
    usedInSpecIds: [spec.id],
  };

  const bannedWordsEntry = {
    ...assertionToLibraryEntry(aBanned, spec, {
      name: "Banned marketing/referral words",
      description: 'Blocks "advice", "consult", "consultation", "free", "com", and ".com" from generated headlines.',
      tags: ["ccheadline", "guardrail", "compliance"],
      visibility: "org",
      ownerId: USER_PRIYA,
    }),
    usageCount: 6,
    usedInSpecIds: [spec.id],
  };

  const headlineLengthEntry = {
    ...assertionToLibraryEntry(aLength, spec, {
      name: "Headline word-count limit (\u22649)",
      description: "Deterministic word-count check that a generated headline stays within a hard word ceiling.",
      tags: ["ccheadline", "format", "word-count"],
      visibility: "org",
      ownerId: USER_PRIYA,
    }),
    usageCount: 4,
    usedInSpecIds: [spec.id],
  };

  // Draft, not yet pinned into the Spec — a direct response to Run v1's dominant failure (8/13
  // headlines opened with the literal phrase "Fix your..."). A mechanical backstop candidate while
  // a wording fix to the Target lands; intentionally still private/experimental.
  const antiRepetitiveOpenerEntry: LibraryAssertion = {
    id: newId("lib"),
    name: 'Anti-repetitive-opener heuristic (draft, "Fix your...")',
    description:
      'Flags headlines starting with the literal phrase "Fix your" — the repetitive template the model fell into in Run v1 (8 of 13 rows). Candidate mechanical backstop while the wording fix is tuned; not yet applied to the Spec.',
    tags: ["ccheadline", "draft", "style"],
    ownerId: USER_DAN,
    visibility: "private",
    usageCount: 0,
    usedInSpecIds: [],
    sourceSpecId: spec.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tier: "custom_code",
    code: "return !/^fix your\\b/i.test(output.trim());",
    codeLanguage: "javascript",
  };

  // Draft, not yet pinned into the Spec — a direct response to the real coverage gap: sentence
  // case (cSentenceCase) has zero assertion coverage today (its old check was removed for
  // enforcing Title Case, which contradicted the spec).
  const sentenceCaseDraftEntry: LibraryAssertion = {
    id: newId("lib"),
    name: "Sentence-case heuristic (draft, coverage gap)",
    description:
      "Coverage-gap candidate: the live Spec's \"headline must use sentence case\" criterion has no assertion today. Heuristic: flags headlines with more than ~2 capitalized words after the first (likely Title Case, not sentence case) — a rough starting point, not a precise grammar check.",
    tags: ["ccheadline", "draft", "coverage-gap"],
    ownerId: USER_VERONICA,
    visibility: "private",
    usageCount: 0,
    usedInSpecIds: [],
    sourceSpecId: spec.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tier: "custom_code",
    code: "const words = output.trim().split(/\\s+/);\nconst capsAfterFirst = words.filter((w, i) => i > 0 && /^[A-Z]/.test(w)).length;\nreturn capsAfterFirst <= 2;",
    codeLanguage: "javascript",
  };

  const datasetEntry = {
    ...datasetToLibraryEntry(spec, {
      name: "ccheadline chat transcripts (13 rows)",
      description: "Real Pearl_User_Chat transcripts used to test the headline generator in production — vehicle and non-vehicle issues alike.",
      tags: ["ccheadline", "golden"],
      visibility: "org",
      ownerId: USER_VERONICA,
    }),
    usageCount: 4,
    usedInSpecIds: [spec.id],
  };

  return {
    assertions: [organicHeadlineEntry, bannedWordsEntry, headlineLengthEntry, antiRepetitiveOpenerEntry, sentenceCaseDraftEntry],
    datasets: [datasetEntry],
  };
}

/**
 * The unified Prompts catalog: the seed Spec's Target mirrors in automatically (with its full
 * promptHistory as version history). No standalone Prompts are seeded — Flow 2 (reverse-engineer)
 * will need its own catalog Prompt once that work starts (see plan's open checklist item).
 */
export function seedPrompts(specs: SpecProject[]): Prompt[] {
  return specs.map((s) => mirrorPromptFromSpec(s)).filter((p): p is Prompt => p !== null);
}
