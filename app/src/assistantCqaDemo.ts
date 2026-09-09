import type { AssistantToolName } from "./assistantTools";
import type { SpecProject } from "./types";
import { buildCqaSpec } from "./seed";

/**
 * North Star's scripted demo scenario for the "CQA Pricing/Refund Detection" Spec.
 *
 * The interesting story for CQA is not generation (the spec is already fully seeded) — it's the
 * ONE deliberately failing synthetic row: an ambiguous "they" that the model misclassifies as
 * JustAnswer billing even though it refers to a photo-restoration vendor. That failure mode is
 * exactly what the system prompt's own K-shot examples warn about, and it's a clean illustration
 * of "production found a gap; AI Studio turns it into a test case."
 *
 * Intercepted client-side in AssistantChat.tsx before the LLM/offline loop, like the CC Headline
 * demo. Returns null for anything that isn't a recognized next step so ordinary questions still
 * reach normal handling.
 */

const demoCloneCache = new Map<string, SpecProject>();

function getFullClone(specId: string): SpecProject {
  let full = demoCloneCache.get(specId);
  if (!full) {
    full = buildCqaSpec();
    demoCloneCache.set(specId, full);
  }
  return full;
}

export function isCqaDemoSpec(spec: SpecProject | null): spec is SpecProject {
  return !!spec && spec.appliedFeature === "CQA (Chat Q&A)";
}

function isCqaTrigger(text: string): boolean {
  return /\bcqa\b/i.test(text) || /\bpricing.{0,10}(help|refund|detect)/i.test(text);
}

function isExplainFailure(text: string): boolean {
  return /\b(what|why|which|explain|show|tell me|understand|analyse|analyze)\b/i.test(text) &&
    /\b(fail|wrong|bad|miss|broke|incorrect|error|issue|problem)\b/i.test(text);
}

function isHowToFix(text: string): boolean {
  return /\b(fix|improve|better|update|change|correct|address)\b/i.test(text);
}

function isRunConfirmation(text: string): boolean {
  return /\b(yes|yep|sure|go ahead|run it|run the suite|run this|please run|do it)\b/i.test(text);
}

function isRegenerateAll(text: string): boolean {
  return /\b(regenerate|redo|refresh|recreate)\b/i.test(text);
}

function isPromoteToTestCase(text: string): boolean {
  return /\b(promote|add|pin|keep|save|make)\b/i.test(text) &&
    /\b(test case|test row|dataset|failing row)\b/i.test(text);
}

export interface CqaDemoStep {
  intro?: string;
  actions: { name: AssistantToolName; summary: string }[];
  outro: string;
  apply: (addSpec: (s: SpecProject) => void, setSpec: (s: SpecProject) => void) => void;
}

/**
 * Matches one turn of the CQA scripted flow. Returns null when the message is not a recognized
 * step — caller falls through to normal handling.
 */
export function matchCqaDemoStep(text: string, spec: SpecProject | null): CqaDemoStep | null {
  // ── Entry: create CQA spec from scratch ──────────────────────────────────────
  if (isCqaTrigger(text) && !isCqaDemoSpec(spec)) {
    return {
      intro:
        'Building this from the real production "CQA Pricing/Refund Detection" Spec — ' +
        "58,940 executions a day, boolean classifier, forced tool call. Not an approximation.",
      actions: [
        {
          name: "create_spec",
          summary:
            'Created Spec "CQA Pricing/Refund Detection" with goal, context, typed I/O, ' +
            "4 requirements, 4 K-shot examples, and an open question about the input variable name mismatch.",
        },
        {
          name: "generate_artifacts",
          summary:
            "Generated the production Prompt (system + user turns), 2 assertions " +
            "(rubric classification check + deterministic output-shape check), " +
            "and a 14-row dataset (13 real conversations, 1 deliberate synthetic failure).",
        },
        {
          name: "run_suite",
          summary:
            "Ran the suite — 13/14 rows pass (93%). The one failure is the synthetic row: " +
            'photo-restoration vendor double charge, ambiguous "they" reference.',
        },
      ],
      outro:
        "Done — 93% pass rate. The one failure is interesting: the synthetic row uses " +
        '"they also charged my card twice" — the model reads "they" as JustAnswer, but it\'s ' +
        'actually a photo-restoration vendor. Head to Results, or ask me "why did this fail?" to dig in.',
      apply: (addSpec) => {
        const full = buildCqaSpec();
        demoCloneCache.set(full.id, full);
        addSpec(full);
      },
    };
  }

  if (!isCqaDemoSpec(spec)) return null;

  // ── Explain the failure ───────────────────────────────────────────────────────
  if (isExplainFailure(text)) {
    return {
      actions: [],
      outro:
        'The failing row is a deliberately tricky synthetic case. The conversation says:\n\n' +
        '> *"They also charged my card twice for it, I only agreed to one payment."*\n\n' +
        'The model classifies this as **true** (JustAnswer billing). It should be **false** — ' +
        '"they" refers to the photo-restoration vendor\'s charge, not JustAnswer\'s membership fee.\n\n' +
        'This is exactly the failure mode the system prompt\'s own K-shot examples warn about: ' +
        '*"They just sent me another bill" → false.* The model still fell for it with a different ' +
        'vendor/phrasing.\n\n' +
        'Two ways to fix it: (1) add a K-shot example to the Prompt covering this exact pattern, ' +
        'or (2) add "photo restoration / order / vendor" to the system prompt\'s false-signal list. ' +
        'Ask me "how do I fix this?" and I\'ll draft the change.',
      apply: () => {},
    };
  }

  // ── How to fix it ─────────────────────────────────────────────────────────────
  if (isHowToFix(text)) {
    return {
      actions: [
        {
          name: "update_spec_fields",
          summary:
            'Added a K-shot example to the Prompt: "They also charged my card for a separate order." → false. ' +
            "Strengthens the 'they = another vendor' signal the model missed.",
        },
      ],
      outro:
        "Added a new K-shot example directly to the Prompt (Prompt tab → system message). " +
        "It's a draft — re-run the suite to see if it fixes the synthetic row without flipping any of the 13 real ones.\n\n" +
        "Want me to promote the synthetic row into a permanent test case first, so this fix is " +
        "tested against it in every future run? Say \"add this as a test case\" and I'll pin it.",
      apply: (_addSpec, setSpec) => {
        const full = getFullClone(spec!.id);
        const updatedPrompt =
          full.target!.promptContent +
          '\n\n# Additional K-shot (added after run)\n"They also charged my card for a separate order." - false';
        setSpec({
          ...spec!,
          target: {
            ...full.target!,
            promptContent: updatedPrompt,
            messages: full.target!.messages.map((m, i) =>
              i === 0
                ? {
                    ...m,
                    content: updatedPrompt,
                  }
                : m,
            ),
          },
          updatedAt: Date.now(),
        });
      },
    };
  }

  // ── Promote failing row to permanent test case ────────────────────────────────
  if (isPromoteToTestCase(text)) {
    return {
      actions: [
        {
          name: "add_spec_items",
          summary:
            'Pinned the synthetic failing row as a permanent dataset row (source: "seed", expected: false). ' +
            "It will run in every future full eval suite, not just the one-off that found it.",
        },
      ],
      outro:
        "Done — the row is now a permanent test case in this Spec's Dataset. " +
        "It won't disappear after a regenerate, and it'll run in every future suite.\n\n" +
        "That's the production round-trip this product is designed for: a real failure surfaces → " +
        "it becomes a test → the fix is verified against it → the regression can't come back silently.",
      apply: (_addSpec, setSpec) => {
        const syntheticRow = spec!.dataset[spec!.dataset.length - 1];
        setSpec({
          ...spec!,
          dataset: spec!.dataset.map((row) =>
            row.id === syntheticRow.id ? { ...row, source: "seed" as const } : row,
          ),
          updatedAt: Date.now(),
        });
      },
    };
  }

  // ── Re-run after a fix ────────────────────────────────────────────────────────
  if (isRunConfirmation(text)) {
    const full = getFullClone(spec.id);
    return {
      actions: [
        {
          name: "run_suite",
          summary:
            "Re-ran the suite (14 rows) — 14/14 pass (100%). The synthetic row now correctly returns false.",
        },
      ],
      outro:
        "100% — the fix held across all 14 rows, including the 13 real ones. " +
        "The synthetic 'they' case now classifies correctly as false.\n\n" +
        "This is exactly the loop AI Studio is designed for: production found a failure → " +
        "it became a test case → you fixed the Prompt → you verified the fix didn't break anything else.",
      apply: (_addSpec, setSpec) => {
        const fixedResults = full.runs[0].results.map((r) => ({
          ...r,
          scores: r.scores.map((s) => ({ ...s, passed: true, score: 1, reason: "All assertions passed" })),
        }));
        const fixedRun = { ...full.runs[0], passRate: 1, results: fixedResults, createdAt: Date.now() };
        setSpec({ ...spec!, runs: [...spec!.runs, fixedRun], updatedAt: Date.now() });
      },
    };
  }

  // ── Regenerate all artifacts ──────────────────────────────────────────────────
  if (isRegenerateAll(text)) {
    return {
      actions: [
        {
          name: "generate_artifacts",
          summary:
            "Regenerated Prompt, 2 assertions, and 14-row dataset — matching production exactly.",
        },
        {
          name: "run_suite",
          summary: "Re-ran the suite — 13/14 pass (93%). Same result as before.",
        },
      ],
      outro:
        "Done — same 93% as before. Regenerating doesn't fix the 'they' ambiguity because " +
        "it's the Prompt's K-shot examples that need updating, not the assertion logic. " +
        'Ask me "how do I fix this?" to improve the Prompt directly.',
      apply: (_addSpec, setSpec) => {
        setSpec({
          ...spec!,
          target: full.target,
          assertions: full.assertions,
          judge: full.judge,
          dataset: full.dataset,
          runs: full.runs,
          updatedAt: Date.now(),
        });
      },
    };
  }

  return null;
}

// Needed in the regenerate-all apply closure above
const full = buildCqaSpec();
