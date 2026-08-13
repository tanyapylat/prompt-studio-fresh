import type {
  Assertion,
  AssertionScore,
  DatasetItem,
  Library,
  LibraryAssertion,
  LibraryJudgePolicy,
  MockUser,
  Prompt,
  RunItemResult,
  SpecProject,
} from "./types";
import { createBlankSpec, newCriterion, newExample, newPowerTag } from "./specFactory";
import { classifyAssertionsFor, finalizeRun, scoreCodeAssertion } from "./engine";
import { newId } from "./utils/id";
import { assertionToLibraryEntry, datasetToLibraryEntry, judgeToLibraryEntry } from "./libraryFactory";
import { addStandalonePromptVersion, createStandalonePrompt, mirrorPromptFromSpec } from "./promptFactory";

/** Mock users, standing in for real auth — lets Private vs. Org-wide visibility actually be demoed. */
export const USER_VERONICA = "user_veronica";
export const USER_DAN = "user_dan";
export const USER_PRIYA = "user_priya";

export function seedUsers(): MockUser[] {
  return [
    { id: USER_VERONICA, name: "Prompt Hanks", initials: "PH" },
    { id: USER_DAN, name: "Eval Presley", initials: "EP" },
    { id: USER_PRIYA, name: "Leonardo DiPromptio", initials: "LD" },
  ];
}

/**
 * Three seed Specs, each demonstrating a different point in the workflow:
 *  - Pre-Connection Assurance Message: reverse-engineered from a real production function-calling
 *    config ("device_brand"/Pearl), fully baked and ready to publish.
 *  - Company Identity Guardrail: reverse-engineered from a real production function-calling judge
 *    config, fully baked (with one deliberate known miss to review).
 *  - Incoming Question Routing: brief only, nothing generated yet — click Generate to see the
 *    real (or simulated, if no OPENAI_API_KEY) pipeline run live.
 * All three are hand-authored rather than produced by calling generateAndRun() at load time, so
 * the app has good-looking content immediately with no network call and no per-reload API cost.
 * They're also stamped with different mock owners/visibility so the Library and Home Mine/Org
 * filters have something real to demonstrate right away.
 * Naming note: avoid the word "triage" anywhere in Spec/product names in this file.
 */

/**
 * Reverse-engineered from a real production artifact: an OpenAI function-calling config
 * ("device_brand") for Pearl, JustAnswer's virtual assistant — generates the final message right
 * before connecting a customer to an Expert. Genuinely a generation task (produces customer-facing
 * text), unlike the Company Identity Guardrail spec below, which only grades existing replies.
 */
function buildPreConnectionAssuranceSpec(): SpecProject {
  let spec = createBlankSpec("Pre-Connection Assurance Message", USER_PRIYA, "org");

  const gPrice = newCriterion("Must never mention price.", "guardrail");
  const gAnswerDirectly = newCriterion("Must never answer the customer's question directly.", "guardrail");
  const gAskClarify = newCriterion("Must never ask the customer to clarify their question.", "guardrail");
  const cOneQuestion = newCriterion(
    "Must always ask exactly one question — whether there's anything else the Expert should know before connecting.",
  );
  const cReassurance = newCriterion(
    "Must include a reassurance sentence referencing the customer's specific problem and confirming the Expert will be able to help.",
  );
  const cBrandOnly = newCriterion(
    'brand must be the literal string "None" unless a device brand is explicitly mentioned in the customer message.',
  );
  const cBrandCapitalized = newCriterion('brand must be properly capitalized (e.g. "Samsung", not "samsung").');

  spec = {
    ...spec,
    goal:
      "Generate Pearl's (JustAnswer's virtual assistant) final message to the customer right before connecting them to an Expert: extract the device brand if one is mentioned, and ask exactly one follow-up question that reassures the customer by name-checking their specific problem — without answering the question or discussing price.",
    inputContract:
      'Two inputs: shortexpertsingular (the Expert-type label used in the message, e.g. "Technician"), and ae_customer_message (the customer\'s raw problem description).',
    outputContract:
      'Returned via a forced tool call (not free text): brand (string — the device brand exactly as mentioned, properly capitalized, or the literal "None" if none is mentioned) and assurance_message (exactly two sentences: the follow-up question, then the reassurance).',
    guardrails: [gPrice, gAnswerDirectly, gAskClarify],
    criteria: [cOneQuestion, cReassurance, cBrandOnly, cBrandCapitalized],
    examples: [
      newExample(
        "Expert type: Technician. Customer message: My Samsung laptop makes a clicking noise and won't boot.",
        '{"brand": "Samsung", "assurance_message": "Is there anything else the Technician should know before I connect you? Rest assured they will be able to help with your Samsung laptop that is making a clicking noise and will not boot."}',
      ),
      newExample(
        "Expert type: Technician. Customer message: My Asus desktop is overheating and shutting down.",
        '{"brand": "Asus", "assurance_message": "Is there anything else the Technician should know before I connect you? Rest assured they will be able to help with your Asus desktop that is overheating and shutting down."}',
      ),
      newExample(
        "Expert type: Technician. Customer message: My Lenovo laptop suddenly can't connect to WiFi.",
        '{"brand": "Lenovo", "assurance_message": "Is there anything else the Technician should know before I connect you? Rest assured they will be able to help with your Lenovo laptop that suddenly cannot connect to WiFi."}',
      ),
    ],
    powers: [newPowerTag("Pearl Pre-Connection Assistant", "ai")],
    access: [{ userId: USER_VERONICA, role: "editor" }],
  };

  const assertions = classifyAssertionsFor(spec);
  const byCriterion = (id: string) => assertions.find((a) => a.sourceCriterionId === id)!;

  // Human-in-the-loop edits (EVAL-4): the auto-classifier left these two as free-form rubric
  // judgments, but both are cheaply and more reliably checked mechanically against the tool's
  // structured output — the same kind of fix a Prompt Engineer makes right after a first Generate.
  const aOneQuestion = byCriterion(cOneQuestion.id);
  aOneQuestion.tier = "deterministic";
  aOneQuestion.check = { mode: "regex_match", value: "^[^?]*\\?[^?]*$" };
  aOneQuestion.description = "assurance_message must contain exactly one question mark";
  aOneQuestion.group = "Output shape";

  const aBrandCapitalized = byCriterion(cBrandCapitalized.id);
  aBrandCapitalized.tier = "deterministic";
  aBrandCapitalized.check = { mode: "regex_match", value: '"brand":\\s*"(None|[A-Z][A-Za-z]*)"' };
  aBrandCapitalized.description = 'brand field must be "None" or start with a capital letter';
  aBrandCapitalized.group = "Output shape";

  const aBrandOnly = byCriterion(cBrandOnly.id);
  aBrandOnly.group = "Output shape";

  const aReassurance = byCriterion(cReassurance.id);
  aReassurance.group = "Content quality";
  // Rubric-graded and inherently a little fuzzy — allow an occasional miss rather than demanding 100%.
  aReassurance.passThreshold = 0.9;

  const aAnswerDirectly = byCriterion(gAnswerDirectly.id);
  aAnswerDirectly.group = "Guardrails";
  byCriterion(gPrice.id).group = "Guardrails";
  byCriterion(gAskClarify.id).group = "Guardrails";

  spec.assertions = assertions;
  spec.judge = {
    id: newId("judge"),
    model: "gpt-4o-mini",
  };

  spec.target = {
    id: newId("target"),
    model: "gpt-4o",
    temperature: 0.2,
    status: "draft",
    createdAt: Date.now() - 4 * 24 * 60 * 60 * 1000,
    // Close to verbatim from the real production tool-calling config.
    promptContent: [
      "You are Pearl, a virtual assistant for JustAnswer. You connect customers with the {{shortexpertsingular}} who will be able to help with the customer's problem.",
      "",
      "Based on the customer's question, ALWAYS and ONLY ask EXACTLY 1 question and provide the brand of the customer's device if mentioned.",
      "NEVER discuss price. NEVER answer the customer's question. NEVER ask the customer to clarify their question.",
      "",
      "Your question MUST consist of ONLY two sentences:",
      "1. Ask whether there is anything else the {{shortexpertsingular}} needs to know.",
      "2. Tell the customer to rest assured the {{shortexpertsingular}} will be able to help with [customer's problem]. Make sure to refer to the customer's specific problem.",
      "",
      "Respond by calling the device_brand tool with exactly two fields:",
      "- brand: the brand of the customer's device, capitalized. Return the brand ONLY IF it is mentioned, else return \"None\".",
      "- assurance_message: the two-sentence message described above.",
      "",
      "Example: \"Is there anything else the Computer expert should know before I connect you? Rest assured they'll be able to help with your question about your broken computer screen.\"",
    ].join("\n"),
  };

  const dataset: DatasetItem[] = spec.examples.map((e) => ({
    id: newId("item"),
    input: e.input,
    source: "seed",
    expectedOutput: e.expectedOutput,
  }));
  spec.dataset = dataset;

  // Row 1 (Asus desktop) is a deliberate miss: the model slips in real troubleshooting advice
  // instead of sticking to the one-question format — exactly what gAnswerDirectly exists to catch,
  // and it drops the required question mark as a natural side effect (caught automatically by the
  // aOneQuestion code check below, no separate authoring needed).
  const outputs = [
    dataset[0].expectedOutput!,
    '{"brand": "Asus", "assurance_message": "It sounds like your Asus desktop just needs some airflow \u2014 try cleaning out the vents and letting it cool down. Rest assured the Technician will be able to help with your overheating desktop."}',
    dataset[2].expectedOutput!,
  ];

  const results: RunItemResult[] = dataset.map((item, i) => {
    const output = outputs[i];
    const scores: AssertionScore[] = assertions.map((a) => {
      if (a.tier === "deterministic" && a.check) {
        const r = scoreCodeAssertion(a.check, output);
        return { assertionId: a.id, passed: r.passed, reason: r.reason };
      }
      if (i === 1 && a.id === aAnswerDirectly.id) {
        return {
          assertionId: a.id,
          passed: false,
          reason:
            'Judge: the message gives unsolicited troubleshooting advice ("try cleaning out the vents") instead of only asking the follow-up question — this answers the customer\'s problem directly.',
        };
      }
      return { assertionId: a.id, passed: true, reason: `Judge: consistent with "${a.description}".` };
    });
    return { datasetItemId: item.id, output, scores };
  });

  results[1].note =
    'The model slipped in real troubleshooting advice ("try cleaning out the vents") instead of sticking to the one-question format — which also means it dropped the required follow-up question entirely. A clean example of why the "never answer the question" guardrail matters; worth a few-shot example showing the assistant staying in its lane even when the fix seems obvious.';

  spec.runs = [finalizeRun(spec, results, "simulated")];
  return spec;
}

/**
 * Reverse-engineered from a real production artifact: an OpenAI function-calling judge config
 * ("wrong_company_check") that grades a single Expert/AI Assistant reply for whether it implies
 * working for a company other than JustAnswer. Kept as its own Spec rather than folded into a
 * broader conversation-quality classifier — it grades one reply at a time (not a full transcript)
 * and its output shape (ok/wrong via a forced tool call) doesn't match a true/false classifier's,
 * so treating it as a separate thing is more faithful to what's actually running in production.
 */
function buildCompanyIdentityGuardrailSpec(): SpecProject {
  let spec = createBlankSpec("Company Identity Guardrail", USER_DAN, "org");

  const cMustFlag = newCriterion(
    'Must return "wrong" whenever the reply implies the Expert/AI Assistant works for a company other than JustAnswer.',
  );
  const cMustClear = newCriterion(
    'Must return "ok" when the reply denies working for a wrong company, or confirms it works for JustAnswer.',
  );
  const gExpertTitleException = newCriterion(
    'Must not flag another company\'s name when used in front of an Expert title (e.g. "Mercedes Mechanic", "Apple Technician", "Hotpoint Technician") — that usage is allowed and is not a violation.',
    "guardrail",
  );

  const leak1 = "Yes, I work for Microsoft and I can reset that for you.";
  const leak2 = "This is Apple Support, how can I help you today?";
  const leak3 = "I work for both JustAnswer and Amazon, so I can see your order.";
  const expertTitleSafe = "I'm your JustAnswer Mercedes Mechanic today — happy to help with that brake issue.";

  spec = {
    ...spec,
    goal:
      "Grade a single Expert/AI Assistant reply on the JustAnswer platform for whether it implies working for a company other than JustAnswer — run per-reply in production so a bad response can be caught immediately, independent of any broader conversation-quality check.",
    inputContract: "One Expert/AI Assistant reply — a single message, evaluated on its own, not the full conversation.",
    outputContract:
      'Returned via a forced tool call (not free text): "reasoning" (one short sentence) and "response", exactly "ok" or "wrong".',
    guardrails: [gExpertTitleException],
    criteria: [cMustFlag, cMustClear],
    examples: [
      newExample(leak1, "wrong"),
      newExample(leak2, "wrong"),
      newExample(leak3, "wrong"),
      newExample(expertTitleSafe, "ok"),
    ],
    powers: [newPowerTag("Chatbot Conversation Module", "ai"), newPowerTag("Expert Chat Safety Guardrail", "manual")],
    access: [{ userId: USER_PRIYA, role: "viewer" }],
  };

  const enumAssertion: Assertion = {
    id: newId("assert"),
    sourceCriterionId: null,
    tier: "deterministic",
    description: "Output must be exactly one of: ok / wrong — nothing else",
    check: { mode: "enum", value: "ok,wrong" },
    status: "draft",
  };
  enumAssertion.group = "Output shape";
  const assertions = [enumAssertion, ...classifyAssertionsFor(spec)];
  const byCriterion = (id: string) => assertions.find((a) => a.sourceCriterionId === id)!;
  const aMustFlag = byCriterion(cMustFlag.id);
  const aMustClear = byCriterion(cMustClear.id);
  const aExpertTitleException = byCriterion(gExpertTitleException.id);
  aMustFlag.group = "Company-identity safety";
  aMustClear.group = "Company-identity safety";
  aExpertTitleException.group = "Company-identity safety";

  spec.assertions = assertions;
  spec.judge = {
    id: newId("judge"),
    model: "gpt-4o-mini",
    temperature: 0,
    // A team-authored refinement of the default grading instructions, added after the row-4 miss
    // below kept recurring: spells out the Expert-title exception explicitly for the judge, not
    // just for the target prompt.
    systemPrompt:
      'You are a strict grader checking whether an AI assistant\'s reply implies it works for a company other than JustAnswer. Respond "wrong" only if the reply explicitly claims employment by, or being from, a different company. The Expert-title exception (e.g. "Mercedes Mechanic", "Apple Technician", "Hotpoint Technician") is allowed and must never be flagged on its own — the mention of another company/brand name only in front of an Expert title is not a violation.',
  };

  spec.target = {
    id: newId("target"),
    model: "gpt-4o-mini",
    temperature: 0,
    status: "draft",
    createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
    // This is the real system prompt from the production tool-calling config, close to verbatim.
    promptContent: [
      "CONTEXT: The customer is on the JustAnswer website. The AI Assistant works for the company JustAnswer. This is JustAnswer.",
      "ONLY JustAnswer is the RIGHT company. EVERY other company (e.g., Microsoft, Uber, etc.) is a WRONG company.",
      "Right: JustAnswer.",
      "Wrong: ALL other companies.",
      "The AI Assistant must NEVER say it works for a wrong company. The AI Assistant must DENY that it works at a wrong company.",
      "",
      "ROLE: Detect whenever the AI Assistant says that it works for a wrong company. Provide the reasoning for your response.",
      "EXCEPTION: The AI Assistant CAN use another company's name in front of Expert titles (e.g., Mercedes Mechanic, Apple Technician, Hotpoint Technician).",
      "",
      "Respond by calling the wrong_company_check tool with exactly two fields: reasoning (one short sentence) and response (\"ok\" or \"wrong\") — never free text.",
    ].join("\n"),
  };

  const dataset: DatasetItem[] = spec.examples.map((e) => ({
    id: newId("item"),
    input: e.input,
    source: "seed",
    expectedOutput: e.expectedOutput,
  }));
  spec.dataset = dataset;

  // Row 3 (the Expert-title exception case) is a deliberate miss — exactly the kind of false
  // positive the EXCEPTION clause exists to prevent, and a realistic failure mode for a keyword-
  // sensitive classifier ("Mercedes" pattern-matching as a company name regardless of context).
  const outputs = ["wrong", "wrong", "wrong", "wrong"];

  const results: RunItemResult[] = dataset.map((item, i) => {
    const output = outputs[i];
    const scores: AssertionScore[] = assertions.map((a) => {
      if (a.tier === "deterministic" && a.check) {
        const r = scoreCodeAssertion(a.check, output);
        return { assertionId: a.id, passed: r.passed, reason: r.reason };
      }
      const isDeliberateMiss = i === 3 && (a.id === aExpertTitleException.id || a.id === aMustClear.id);
      if (isDeliberateMiss) {
        const reason =
          a.id === aExpertTitleException.id
            ? '"Mercedes Mechanic" is squarely the Expert-title exception — the model should not have flagged this, but returned "wrong" anyway.'
            : 'The reply never claims to work for a wrong company; the model should have returned "ok" here.';
        return { assertionId: a.id, passed: false, reason };
      }
      if (a.id === aMustFlag.id) {
        return {
          assertionId: a.id,
          passed: output === "wrong",
          reason:
            output === "wrong"
              ? `Correctly returned "wrong" — the reply explicitly claims to work for a different company.`
              : `Correctly returned "ok" — no wrong-company claim present.`,
        };
      }
      return { assertionId: a.id, passed: true, reason: `Consistent with "${a.description}".` };
    });
    return { datasetItemId: item.id, output, scores };
  });

  results[3].note =
    'The classifier over-fired on the literal word "Mercedes" and flagged this as a wrong-company claim, even though it\'s squarely the Expert-title exception the system prompt calls out by name. Worth adding this exact pattern as a few-shot example, or tightening calibration specifically against Expert-title phrasing.';

  spec.runs = [finalizeRun(spec, results, "simulated")];
  return spec;
}

function buildQuestionRoutingDraftSpec(): SpecProject {
  let spec = createBlankSpec("Incoming Question Routing", USER_VERONICA, "private");
  return {
    ...spec,
    goal:
      "Classify an incoming customer question the moment it's submitted, before it's matched to an Expert, so the routing system can pick the right Expert category and flag urgent cases for faster matching.",
    inputContract:
      "The customer's raw question text as submitted, plus the category they selected from the dropdown (e.g. Legal, Medical, Vehicle, Technology, Home Improvement, Finance).",
    outputContract:
      'A JSON object with exactly these fields: confirmed_category (string), urgency ("low"|"medium"|"high"), key_facts (string array), suggested_expert_specialty (string).',
    guardrails: [
      newCriterion("Must not invent facts that are not present in the question text.", "guardrail"),
      newCriterion(
        "Must not diagnose, give legal advice, or otherwise answer the question itself — this step only classifies.",
        "guardrail",
      ),
    ],
    criteria: [
      newCriterion("Must set urgency to high whenever the question mentions a legal deadline, safety risk, or medical emergency."),
      newCriterion("Must correct confirmed_category if the customer clearly selected the wrong dropdown category."),
      newCriterion("key_facts must be extracted verbatim or near-verbatim from the question, not paraphrased into new claims."),
    ],
    examples: [
      newExample(
        "Category selected: Vehicle. My car has been making a grinding noise when I brake, and now the pedal goes almost to the floor. I have to drive my kids to school tomorrow morning, is this safe?",
        '{"confirmed_category": "Vehicle", "urgency": "high", "key_facts": ["grinding noise when braking", "brake pedal goes almost to the floor", "needs to drive children tomorrow morning"], "suggested_expert_specialty": "Automotive brake systems"}',
      ),
      newExample(
        "Category selected: Finance. I got a notice from the IRS about an amended return I filed two months ago and I'm not sure what it means.",
        '{"confirmed_category": "Finance", "urgency": "medium", "key_facts": ["received an IRS notice", "about an amended return filed two months ago"], "suggested_expert_specialty": "Tax / IRS correspondence"}',
      ),
    ],
    powers: [newPowerTag("Question Intake Routing", "manual")],
  };
}

export function seedSpecs(): SpecProject[] {
  return [buildQuestionRoutingDraftSpec(), buildCompanyIdentityGuardrailSpec(), buildPreConnectionAssuranceSpec()];
}

/**
 * Seed the Library with entries reused from the two fully-baked seed Specs above (no invented
 * content) plus a couple of private, other-owner entries whose only purpose is to make the
 * Private vs. Org-wide visibility filter demonstrable the moment the app loads, before anyone
 * has clicked "Save to library" themselves.
 */
export function seedLibrary(): Library {
  const assuranceSpec = buildPreConnectionAssuranceSpec();
  const companyIdentitySpec = buildCompanyIdentityGuardrailSpec();

  const oneQuestionAssertion = assuranceSpec.assertions.find((a) => a.description.includes("question mark"))!;
  const brandAssertion = assuranceSpec.assertions.find((a) => a.description.includes("brand field"))!;
  const priceAssertion = assuranceSpec.assertions.find((a) => a.description.toLowerCase().includes("price"))!;

  const oneQuestionAssertionEntry = {
    ...assertionToLibraryEntry(oneQuestionAssertion, assuranceSpec, {
      name: "Exactly one question in output",
      description: "Blocks zero-question or multi-question replies from a message meant to ask exactly one thing.",
      tags: ["pearl", "format", "guardrail"],
      visibility: "org",
      ownerId: USER_PRIYA,
    }),
    usageCount: 7,
    usedInSpecIds: [assuranceSpec.id],
  };

  const brandAssertionEntry = {
    ...assertionToLibraryEntry(brandAssertion, assuranceSpec, {
      name: "Device brand capitalized or None",
      description: 'Confirms the extracted brand field is properly capitalized, or the literal "None" when no brand is mentioned.',
      tags: ["pearl", "format", "extraction"],
      visibility: "org",
      ownerId: USER_PRIYA,
    }),
    usageCount: 5,
    usedInSpecIds: [assuranceSpec.id],
  };

  const priceAssertionEntry = {
    ...assertionToLibraryEntry(priceAssertion, assuranceSpec, {
      name: "No price mentions before Expert connection",
      description: "Blocks any mention of price in the pre-connection assurance message — pricing is handled elsewhere in the flow.",
      tags: ["pearl", "guardrail", "financial-safety"],
      visibility: "org",
      ownerId: USER_PRIYA,
    }),
    usageCount: 8,
    usedInSpecIds: [assuranceSpec.id, companyIdentitySpec.id],
  };

  const escalationAssertionEntry: LibraryAssertion = {
    id: newId("lib"),
    name: "Escalation keyword flag (experimental)",
    description: "Flags replies that mention escalating to a manager — still being validated against false positives.",
    tags: ["experimental", "support"],
    ownerId: USER_DAN,
    visibility: "private",
    usageCount: 1,
    usedInSpecIds: [],
    sourceSpecId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tier: "deterministic",
    check: { mode: "contains", value: "escalat" },
  };

  const closeToGoldenPhraseEntry: LibraryAssertion = {
    id: newId("lib"),
    name: "Close to golden reassurance phrasing",
    description: "Deterministic-catalog example beyond contains/excludes: output must stay within a small edit distance of a reference reassurance sentence.",
    tags: ["pearl", "similarity"],
    ownerId: USER_PRIYA,
    visibility: "org",
    usageCount: 2,
    usedInSpecIds: [assuranceSpec.id],
    sourceSpecId: assuranceSpec.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tier: "deterministic",
    check: {
      mode: "levenshtein",
      value: "",
      reference: "Rest assured they will be able to help with your problem.",
      threshold: 15,
    },
  };

  const customCodeAssertionEntry: LibraryAssertion = {
    id: newId("lib"),
    name: "Output is non-trivial length",
    description: "Custom-code example: rejects suspiciously short outputs that are unlikely to satisfy the two-sentence format.",
    tags: ["format", "custom-code"],
    ownerId: USER_VERONICA,
    visibility: "org",
    usageCount: 0,
    usedInSpecIds: [],
    sourceSpecId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tier: "custom_code",
    code: "return output.trim().length >= 20;",
    codeLanguage: "javascript",
  };

  const datasetEntry = {
    ...datasetToLibraryEntry(assuranceSpec, {
      name: "Golden pre-connection examples",
      description: "Real Pearl pre-connection inputs covering device-brand extraction across common repair categories.",
      tags: ["pearl", "golden"],
      visibility: "org",
      ownerId: USER_PRIYA,
    }),
    usageCount: 5,
    usedInSpecIds: [assuranceSpec.id],
  };

  const judgeEntry = {
    ...judgeToLibraryEntry(companyIdentitySpec, {
      name: "Company-identity guardrail judge",
      description: "gpt-4o-mini judge for the wrong-company-claim check.",
      tags: ["safety", "company-identity"],
      visibility: "org",
      ownerId: USER_DAN,
    }),
    usageCount: 3,
    usedInSpecIds: [companyIdentitySpec.id],
  };

  const draftToxicityJudgeEntry: LibraryJudgePolicy = {
    id: newId("lib"),
    name: "Toxicity judge (draft)",
    description: "Experimental toxicity judge — still being tuned.",
    tags: ["toxicity", "draft"],
    ownerId: USER_PRIYA,
    visibility: "private",
    usageCount: 0,
    usedInSpecIds: [],
    sourceSpecId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    model: "gpt-4o-mini",
  };

  return {
    assertions: [
      oneQuestionAssertionEntry,
      brandAssertionEntry,
      priceAssertionEntry,
      escalationAssertionEntry,
      closeToGoldenPhraseEntry,
      customCodeAssertionEntry,
    ],
    datasets: [datasetEntry],
    judgePolicies: [judgeEntry, draftToxicityJudgeEntry],
  };
}

/**
 * The unified Prompts catalog: every seed Spec's Target mirrors in automatically (with its full
 * `promptHistory` as version history), plus a couple of hand-authored standalone Prompts — not
 * tied to any Spec — so the "create prompts directly" path and the Linked/Standalone filter both
 * have something real to show immediately.
 */
export function seedPrompts(specs: SpecProject[]): Prompt[] {
  const mirrored = specs
    .map((s) => mirrorPromptFromSpec(s))
    .filter((p): p is Prompt => p !== null);

  const supportReplyTemplate = addStandalonePromptVersion(
    addStandalonePromptVersion(
      createStandalonePrompt("Generic Support Reply Template", USER_DAN, "org"),
      {
        promptContent:
          "You are a JustAnswer support agent. Reply to the customer's message in a warm, concise tone. Never make promises about refunds or timelines you can't guarantee.",
        model: "gpt-4o-mini",
        temperature: 0.4,
      },
    ),
    {
      promptContent:
        "You are a JustAnswer support agent. Reply to the customer's message in a warm, concise tone — 2-4 sentences. Never make promises about refunds or timelines you can't guarantee. Always end by asking if there's anything else you can help with.",
      model: "gpt-4o-mini",
      temperature: 0.4,
      status: "published",
    },
  );

  // Demonstrates Tools + Output Schema in the Playground — a Tool the model could call to pull
  // fresh activity, and a strict JSON shape for the digest itself — without touching any Spec's
  // Eval Suite, which never reads these fields.
  const draftIdeaPrompt = addStandalonePromptVersion(
    createStandalonePrompt("Weekly Digest Summarizer (idea)", USER_VERONICA, "private"),
    {
      promptContent:
        "You summarize a team's weekly activity into a short digest for their manager. Be concise and specific — cite concrete items, not vague generalities.",
      model: "gpt-4o-mini",
      temperature: 0.5,
      messages: [
        {
          id: newId("msg"),
          role: "system",
          content:
            "You summarize a team's weekly activity into a short digest for their manager. Be concise and specific — cite concrete items, not vague generalities.",
        },
        { id: newId("msg"), role: "human", content: "Team: {team_name}\n\nActivity log:\n{activity_log}" },
      ],
      tools: [
        {
          id: newId("tool"),
          name: "fetch_weekly_activity",
          description: "Looks up a team's raw activity log for the past 7 days.",
          parameters:
            '{\n  "type": "object",\n  "properties": {\n    "team_name": { "type": "string" }\n  },\n  "required": ["team_name"]\n}',
        },
      ],
      outputSchema: {
        enabled: true,
        name: "weekly_digest",
        schema:
          '{\n  "type": "object",\n  "properties": {\n    "summary": { "type": "string" },\n    "highlights": { "type": "array", "items": { "type": "string" } }\n  },\n  "required": ["summary", "highlights"]\n}',
      },
    },
  );

  return [supportReplyTemplate, draftIdeaPrompt, ...mirrored];
}
