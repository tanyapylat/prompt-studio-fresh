import type { AssistantToolName } from "./assistantTools";
import type { GenerateArtifact, SpecProject } from "./types";
import { buildCcheadlineSpec } from "./seed";

/**
 * North Star's one hardcoded, fully-scripted demo scenario: "generate CC headline" walks the user
 * through the exact same guided flow a live agent would (brief → choose artifacts → run → iterate
 * per-tab), but every artifact it produces is cloned verbatim from the real seeded "Conversational
 * Chat Headline" Spec (see `seed.ts`'s `buildCcheadlineSpec`) instead of invented by the generic
 * simulated/LLM generator. It's intercepted client-side in `AssistantChat.tsx`, before the
 * LLM/offline-script loop, so the whole scenario is deterministic in both live and offline mode.
 *
 * The flow is a tiny state machine keyed off the currently-open Spec (tagged via `appliedFeature`,
 * matching the seed data) and what artifacts it's missing so far — NOT off tool-call history — so
 * arbitrary questions can be asked in between steps without derailing it (`matchCcheadlineDemoStep`
 * returns `null` for anything that isn't a recognized next step, and the caller falls through to
 * normal handling).
 */

/** Caches the one real clone backing an in-progress demo Spec, keyed by its `id`, so every step
 *  (generate one artifact at a time, regenerate assertions/dataset later, run) reads consistent
 *  ids for assertions/dataset/run rather than re-minting a disconnected fresh clone each time. */
const demoCloneCache = new Map<string, SpecProject>();

function getFullClone(specId: string): SpecProject {
  let full = demoCloneCache.get(specId);
  if (!full) {
    full = buildCcheadlineSpec();
    demoCloneCache.set(specId, full);
  }
  return full;
}

export function isCcheadlineDemoSpec(spec: SpecProject | null): spec is SpecProject {
  return !!spec && spec.appliedFeature === "CC Headline";
}

function isCcheadlineTrigger(text: string): boolean {
  return /\bcc\s*head\w*\b/i.test(text) || /\bconversational\s+chat\s+headline\b/i.test(text);
}

const ARTIFACT_LABEL: Record<GenerateArtifact, string> = {
  prompt: "the Prompt",
  assertions: "Assertions",
  dataset: "a Dataset",
};

function missingArtifacts(spec: SpecProject): GenerateArtifact[] {
  const missing: GenerateArtifact[] = [];
  if (!spec.target) missing.push("prompt");
  if (spec.assertions.length === 0) missing.push("assertions");
  if (spec.dataset.length === 0) missing.push("dataset");
  return missing;
}

/** Parses "everything" / "just the prompt" / "assertions and dataset" / a bare "yes" into a selection. */
function parseArtifactSelection(text: string): Record<GenerateArtifact, boolean> | null {
  const lower = text.toLowerCase();
  if (/\b(everything|all three|all of (it|them)|both|all|yes|yep|yeah|sure|go ahead|do it|please do)\b/.test(lower)) {
    return { prompt: true, assertions: true, dataset: true };
  }
  const prompt = /\bprompts?\b/.test(lower);
  const assertions = /\bassertions?\b/.test(lower);
  const dataset = /\bdatasets?\b/.test(lower);
  return prompt || assertions || dataset ? { prompt, assertions, dataset } : null;
}

function isRunConfirmation(text: string): boolean {
  return /\b(yes|yep|yeah|sure|go ahead|do it|run it|run the suite|run this|please run)\b/i.test(text);
}

function isRegenerateAll(text: string): boolean {
  // Catches the canned "Ask to regenerate" button message as well as natural "regenerate everything"
  return /\b(regenerate|redo|refresh|recreate)\b/i.test(text) &&
    (/\b(prompt|assertions?)\b/i.test(text) && /\bdatasets?\b/i.test(text));
}

function isRegenerateAssertions(text: string): boolean {
  return !isRegenerateAll(text) &&
    /\bassertions?\b/i.test(text) && /\b(regenerate|redo|refresh|again|recreate)\b/i.test(text);
}

function isRegenerateDataset(text: string): boolean {
  return !isRegenerateAll(text) &&
    /\bdatasets?\b/i.test(text) && /\b(regenerate|redo|refresh|again|recreate|reload|restore)\b/i.test(text);
}

export interface DemoStep {
  intro?: string;
  actions: { name: AssistantToolName; summary: string }[];
  outro: string;
  apply: (addSpec: (s: SpecProject) => void, setSpec: (s: SpecProject) => void) => void;
}

function describeSelection(want: Record<GenerateArtifact, boolean>): string {
  const parts: string[] = [];
  if (want.prompt) parts.push("the real Prompt");
  if (want.assertions) parts.push("5 real assertions");
  if (want.dataset) parts.push("13 real dataset rows");
  return `Generated ${parts.join(", ")} — matching production exactly.`;
}

function nextQuestion(missingAfter: GenerateArtifact[]): string {
  if (missingAfter.length === 0) return "Ready to run the eval suite against these 13 rows?";
  return `Want me to generate ${missingAfter.map((m) => ARTIFACT_LABEL[m]).join(" and ")} too, or run with what we have so far?`;
}

/**
 * Matches one turn of the scripted flow against the message + currently-open Spec. Returns `null`
 * when the message isn't a recognized step, so the caller falls through to normal handling —
 * this only ever intercepts messages that are unambiguously part of the scenario.
 */
export function matchCcheadlineDemoStep(text: string, spec: SpecProject | null): DemoStep | null {
  if (isCcheadlineTrigger(text)) {
    return {
      intro:
        'Building this from scratch, using the exact brief the real production "Conversational Chat ' +
        'Headline" system already ships with — not a fresh approximation.',
      actions: [
        {
          name: "create_spec",
          summary: 'Created Spec "Conversational Chat Headline" with its goal, context, and requirements.',
        },
      ],
      outro: "Want me to generate the Prompt, Assertions, and Dataset now — all three, or just one to start?",
      apply: (addSpec) => {
        const full = buildCcheadlineSpec();
        const brief: SpecProject = { ...full, target: null, assertions: [], judge: null, dataset: [], runs: [] };
        demoCloneCache.set(brief.id, full);
        addSpec(brief);
      },
    };
  }

  if (!isCcheadlineDemoSpec(spec)) return null;

  const missingNow = missingArtifacts(spec);

  if (missingNow.length > 0) {
    const selection = parseArtifactSelection(text);
    const want = selection && {
      prompt: selection.prompt && missingNow.includes("prompt"),
      assertions: selection.assertions && missingNow.includes("assertions"),
      dataset: selection.dataset && missingNow.includes("dataset"),
    };
    if (want && (want.prompt || want.assertions || want.dataset)) {
      const full = getFullClone(spec.id);
      const updated: SpecProject = {
        ...spec,
        target: want.prompt ? full.target : spec.target,
        assertions: want.assertions ? full.assertions : spec.assertions,
        judge: want.assertions ? full.judge : spec.judge,
        dataset: want.dataset ? full.dataset : spec.dataset,
        updatedAt: Date.now(),
      };
      return {
        actions: [{ name: "generate_artifacts", summary: describeSelection(want) }],
        outro: nextQuestion(missingArtifacts(updated)),
        apply: (_addSpec, setSpec) => setSpec(updated),
      };
    }
    return null;
  }

  if (spec.runs.length === 0 && isRunConfirmation(text)) {
    const full = getFullClone(spec.id);
    const run = full.runs[0];
    const pct = Math.round(run.passRate * 100);
    return {
      actions: [
        {
          name: "run_suite",
          summary: `Ran the suite (${run.results.length} row(s)) — ${pct}% pass rate, matching the real Run v1.`,
        },
      ],
      outro:
        `Done — ${pct}% pass rate. The dominant failure: 8 of 13 headlines literally started with "Fix your…" — ` +
        'a repetitive template. Head to Results for the breakdown, or ask me "how can I improve this?" and I\'ll dig into it.',
      apply: (_addSpec, setSpec) => setSpec({ ...spec, runs: [...spec.runs, run], updatedAt: run.createdAt }),
    };
  }

  if (isRegenerateAll(text)) {
    const full = getFullClone(spec.id);
    return {
      actions: [
        {
          name: "generate_artifacts",
          summary:
            "Regenerated the Prompt, 5 assertions, and 13-row dataset — matching production exactly. " +
            "A revised Prompt might reduce the 'Fix your…' repetition the run surfaced.",
        },
        { name: "run_suite", summary: "Re-ran the suite (13 rows) against the regenerated Prompt — 62% pass rate." },
      ],
      outro:
        "Done — same 62% pass rate as before, because the real fix is in the Prompt wording, not the assertions. " +
        "Head to Results to see which rows still fail, then try editing the Prompt directly to break the 'Fix your…' template.",
      apply: (_addSpec, setSpec) =>
        setSpec({
          ...spec,
          target: full.target,
          assertions: full.assertions,
          judge: full.judge,
          dataset: full.dataset,
          runs: full.runs,
          updatedAt: Date.now(),
        }),
    };
  }

  if (isRegenerateAssertions(text)) {
    const full = getFullClone(spec.id);
    return {
      actions: [
        {
          name: "generate_artifacts",
          summary:
            "Regenerated the 5 real assertions (organic headline, problem wording, brand capitalization, " +
            "banned words, word count) — same production checks.",
        },
      ],
      outro: "Done — same 5 checks as production. Want me to re-run the suite to see the effect, or head to Results?",
      apply: (_addSpec, setSpec) => setSpec({ ...spec, assertions: full.assertions, judge: full.judge, updatedAt: Date.now() }),
    };
  }

  if (isRegenerateDataset(text)) {
    const full = getFullClone(spec.id);
    return {
      actions: [
        {
          name: "generate_artifacts",
          summary: "Restored the 13 real Pearl_User_Chat rows for this Spec — matching production exactly.",
        },
      ],
      outro: "Done. Want me to re-run the suite against these rows, or head to Results?",
      apply: (_addSpec, setSpec) => setSpec({ ...spec, dataset: full.dataset, updatedAt: Date.now() }),
    };
  }

  return null;
}
