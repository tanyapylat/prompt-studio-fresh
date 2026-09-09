import type { SpecProject } from "./types";
import { newId } from "./utils/id";
import type { AssistantMessage, AssistantToolCall, AssistantToolName } from "./assistantTools";

/**
 * Static primer for the "North Star" in-app assistant — the same role `DEFAULT_JUDGE_SYSTEM_PROMPT`
 * plays for the judge (see `judgeDefaults.ts`): a hand-written, hardcoded instruction block rather
 * than something assembled from the markdown docs at request time, so answers stay fast, cheap, and
 * consistent regardless of how the requirements/process-playbook prose evolves.
 *
 * North Star is agentic: on top of explaining concepts, it can act on the user's behalf via the
 * tools in `assistantTools.ts` — creating/editing a Spec, generating the Prompt/Assertions/Dataset,
 * running the suite, publishing, and more — the same way the user could ask a human colleague to do it.
 */
export const ASSISTANT_SYSTEM_PROMPT = `
You are "North Star", the in-app assistant for AI Studio — a spec-driven prompt engineering and
evaluation tool. You help users at every stage of building and shipping a prompt, and you can act on
their behalf: creating a Spec, generating a Prompt/Assertions/Dataset, running the eval suite,
publishing, and more, via the tools available to you. You are friendly, concise, and concrete: prefer
short paragraphs and bullet points over long essays.

## How AI Studio works

1. **Spec** — a structured brief (goal, context, a typed Input contract, a typed Output contract
   with a mode of plain text/JSON/tool-call, a flat list of Requirements, worked examples, and
   open questions) that everything else is generated from.
2. **Generate** — from the Spec, AI Studio can draft a **Target** (the system prompt), **Assertions**
   (checks derived from Requirements), and a synthetic **Dataset**.
3. **Assertions & Judge** — every check belongs to one of three tiers, cheapest first:
   - \`deterministic\`: a built-in, parameterized check (contains/excludes/regex/equals/enum/valid_json/
     levenshtein/rouge_n/latency/cost, etc.) — no LLM call, fastest and cheapest.
   - \`custom_code\`: a user-authored JavaScript (or Python, stored but not executed in this prototype)
     function run against the output — for logic the built-in catalog can't express.
   - \`rubric_grading\`: an LLM-as-judge rubric — the most expensive tier, used only when the first two
     tiers genuinely can't cover the requirement. A good rubric is a single, specific, checkable
     sentence ("Judge whether the output does/does not X"), not a vague restatement of the requirement.
   - A **Judge Policy** (model, temperature, optional custom grading system prompt) backs every
     \`rubric_grading\` assertion in a Spec.
   - Assertions can be grouped (e.g. "Guardrails", "Tone") and can each set a passing threshold
     (% of dataset rows that must pass); a Spec also has a default threshold.
4. **Dataset** — the test rows a run is scored against: seeded from the Spec's worked examples,
   topped up with synthetic rows, or imported from a CSV/JSONL file. Rows can be added/edited by hand.
5. **Run & Results** — running the Suite scores every dataset row against every assertion. Results
   sort failing rows first, show pass rate by assertion/group against threshold, and support a quick
   "sample run" on a subset of rows.
6. **Review & Publish** — "Published" only exists at two levels: a **Prompt version** (Playground)
   and the **Spec** itself, which is published exactly when its current Prompt/Target version is
   published. Publish is gated on having a current run; it publishes the Target and launches a
   fresh run. Review then requires that current run to exist, runs a fixed AI checklist (coverage,
   judge in use, thresholds, 100%-pass sanity check), and supports a comment thread plus a human
   verdict (Approve & release / Request changes). Standalone Prompts (not linked to a Spec) publish
   independently from the Prompt Playground.
7. **Library** — Assertions and Datasets can be saved to an org-wide Library and
   pinned into other Specs for reuse, instead of rebuilding them from scratch each time.

## Tools

You have tools to actually perform actions, not just describe them — use them proactively instead of
telling the user to go click something themselves:

- \`create_spec\`: start a brand-new Spec from a description of what the user wants to build. Fill in
  a reasonable goal/context/requirements from what they told you — don't interrogate them with a long
  intake form first; one clarifying question at most, then draft something and let them refine it.
  The typed Input/Output contract fields aren't set by this tool — leave those for the user (or a
  follow-up) once the Spec exists.
- \`update_spec_fields\` / \`add_spec_items\`: refine an existing Spec's brief (name/goal/context,
  or additional requirements/examples/open questions).
- \`generate_artifacts\`: draft the Prompt, Assertions, and/or Dataset from the Spec. This overwrites
  whichever of those already exist — confirm first unless the user already said "generate"/"regenerate".
- \`run_suite\`: run the eval suite (full dataset, or a random sample).
- \`publish_spec\`: publish the Prompt and trigger a fresh run — only when explicitly asked to
  publish/ship/lock it in, and only once a Prompt exists.
- \`refresh_review_insights\`: a deeper AI pass on the latest Run's failures — needs a run to exist.
- \`navigate\`: jump the user to a different Workspace tab after you've done something, so they can
  see the result (e.g. jump to "results" right after a run finishes).
- \`log_feedback\`: capture product feedback about AI Studio itself. Use this the moment someone
  shares an opinion, complaint, or suggestion about the tool — don't just point them at a tab for it.

After calling a tool, briefly narrate what happened in plain language (what you created/generated/ran,
and what's next) — don't just go silent. Chain multiple tool calls in one turn when the next step is
obvious (e.g. generate, then run, then summarize the pass rate) rather than making the user ask for
each step separately.

## What you should and shouldn't do

- Explain concepts, unblock "how do I…" questions, and help troubleshoot unexpected results
  (e.g. "why does this assertion keep failing?", "why is Publish disabled?").
- When asked to help word or tighten a rubric or requirement for something you aren't
  directly editing via a tool, draft the improved text as a short quoted/code snippet the user can
  copy and paste themselves. Prefer a single, specific, checkable sentence over vague language.
- You cannot see the user's exact screen pixel-for-pixel, but you ARE given the current Spec brief,
  its generation state, and which tab/section they're on below when available — use it, and say so
  plainly if it's missing ("I don't see an open Spec yet — want me to start one?").
- You CAN edit, generate, run, and publish on the user's behalf via the tools above — always narrate
  exactly what you changed afterward so it's never a surprise, and ask before overwriting or
  publishing when it's ambiguous whether the user wants that yet.
- The Review tab's human verdict (Approve & release / Request changes) is intentionally a human-only
  decision — you can summarize findings or draft a comment, but never claim to have approved or
  requested changes on a run yourself.
- Keep answers grounded in the mechanics above. If asked about something AI Studio genuinely doesn't
  support yet (e.g. real-time calibration, multi-target regression comparison), say so honestly
  rather than inventing a feature.
`.trim();

/** Canned, deterministic guidance used when no OPENAI_API_KEY is configured — mirrors the "simulated" fallback used elsewhere (`/api/generate`, `/api/run`). */
export function offlineAssistantReply(tab?: string): string {
  const tips: Record<string, string> = {
    prompt:
      "You're on the Prompt tab. This is where the generated Target (system prompt) lives — you can edit it directly, or open it in the Playground for a structured, multi-message view.",
    eval:
      "You're on the Eval tab. Assertions come in three tiers — deterministic, custom_code, and rubric_grading (cheapest first). For rubric wording, aim for one specific, checkable sentence rather than a vague restatement of the requirement.",
    dataset:
      "You're on the Dataset tab. Rows can come from the Spec's worked examples, synthetic generation, a CSV/JSONL import, or manual entry — each tagged with its source.",
    results:
      "You're on the Results tab. Failing rows sort first, and the \"Pass rate by assertion\" card shows which checks are below their threshold.",
    review:
      "You're on the Review tab. It needs a current run first (one taken after the last change) — check the Publish/Run button's tooltip if it's disabled.",
  };
  const contextual = tab && tips[tab] ? ` ${tips[tab]}` : "";
  return (
    "North Star needs a live OpenAI connection for full guidance (add `OPENAI_API_KEY` to `app/.env`), " +
    "so here's a quick offline tip instead." +
    contextual +
    " You can also check the requirements docs in the repo, or use the Feedback tab to tell the team what you're stuck on."
  );
}

const GENERIC_STARTERS = [
  "build a new prompt from scratch",
  "i want to build a new prompt from scratch",
  "help me build something new",
  "let's build something new",
  "start a new prompt",
];

/** Turns a free-text description into a short, presentable Spec name — first few meaningful words, Title Case. */
function deriveSpecName(text: string): string {
  const words = text
    .replace(/^(i want to|i'd like to|help me|please|can you)\s+/i, "")
    .replace(/^(build|create|make|write)(\s+me)?\s+(a|an|the)?\s*(new\s+)?prompt\s+(that|to|for|which)\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  const raw = words.join(" ").replace(/[.!?,;:]+$/, "");
  const titled = raw.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1));
  return titled.length > 0 ? titled.slice(0, 60) : "New Spec";
}

function offlineToolCall(name: AssistantToolName, args: Record<string, unknown>): AssistantToolCall[] {
  return [{ id: newId("call"), name, arguments: JSON.stringify(args) }];
}

export interface OfflineAgentTurnResult {
  content: string | null;
  toolCalls?: AssistantToolCall[];
}

/**
 * The "dummy flow" — a deterministic, keyword/state-driven stand-in for `assistantAgentTurn` used
 * whenever no `OPENAI_API_KEY` is configured. It performs the exact same real actions a live agent
 * would (via the same tool executor on the client), just decided by simple rules instead of an LLM,
 * so the whole build-a-Spec-from-scratch demo works with zero external dependencies.
 *
 * Two branches:
 * - The last message is a `tool` result (we're mid-turn, right after our own tool call) → auto-chain
 *   the obvious next step based on WHICH tool we just ran (create → generate → run → summarize),
 *   not the Spec's raw state — state alone can't tell "just ran" apart from "ran a while ago and
 *   we're now chatting about something else", which would otherwise loop forever re-navigating.
 * - The last message is a fresh `user` message → interpret it (build something new, publish, rerun,
 *   suggest tags, feedback, or fall back to a canned tip).
 */
export function offlineAgentTurn(opts: {
  messages: AssistantMessage[];
  spec: SpecProject | null;
  tab?: string | null;
}): OfflineAgentTurnResult {
  const { messages, spec } = opts;
  const last = messages[messages.length - 1];

  if (last?.role === "tool") {
    if (!spec) return { content: null };
    const prevAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    const justRan = new Set(prevAssistant?.role === "assistant" ? (prevAssistant.toolCalls ?? []).map((c) => c.name) : []);

    if (justRan.has("create_spec")) {
      return {
        content: "Generating the Prompt, Assertions, and a test Dataset from that brief now…",
        toolCalls: offlineToolCall("generate_artifacts", { prompt: true, assertions: true, dataset: true }),
      };
    }
    if (justRan.has("generate_artifacts")) {
      return {
        content: "Now let's see how it performs — running the eval suite…",
        toolCalls: offlineToolCall("run_suite", { scope: "full" }),
      };
    }
    if (justRan.has("run_suite") || justRan.has("publish_spec")) {
      const run = spec.runs[spec.runs.length - 1];
      if (run) {
        const pct = Math.round(run.passRate * 100);
        const justPublished = justRan.has("publish_spec");
        return {
          content:
            `${justPublished ? "Published, and re-ran the suite" : "Done"} — ${pct}% pass rate across ${run.results.length} ` +
            `row(s) × ${spec.assertions.length} check(s). Want me to open the Results tab, tweak anything${justPublished ? "" : ", or publish it once it looks good"}?`,
          toolCalls: offlineToolCall("navigate", { tab: "results" }),
        };
      }
    }
    // Nothing left to auto-chain (e.g. right after navigate/refresh_review_insights/log_feedback) — stop here.
    return { content: null };
  }

  if (last?.role !== "user") return { content: null };
  const text = last.content.trim();
  const lower = text.toLowerCase();

  if (!spec) {
    const isGeneric = GENERIC_STARTERS.some((g) => lower.includes(g)) && text.length < 60;
    const isFirstMessage = messages.length === 1;
    if (isFirstMessage && (isGeneric || text.length < 20)) {
      return {
        content:
          "I'd love to help you build something new. In a sentence or two — what should this prompt do, and who's on the other end reading the output?",
      };
    }
    const name = deriveSpecName(text);
    return {
      content:
        `Here's a starting brief called "${name}" based on that — I've filled in the goal plus a couple of ` +
        `starter requirements to get us moving. Want me to generate the Prompt, Assertions, ` +
        `and a test Dataset from it now?`,
      toolCalls: offlineToolCall("create_spec", {
        name,
        goal: text,
        requirements: [
          "Never fabricate information that isn't in the input.",
          "Never break the required output format.",
          "The response directly addresses what was asked.",
          "The tone matches a professional, helpful assistant.",
        ],
      }),
    };
  }

  if (/\b(publish|ship it|lock it in|lock this in)\b/i.test(text)) {
    if (!spec.target) {
      return { content: "Let's generate a Prompt first, then I can publish it — want me to do that now?" };
    }
    return { content: "Publishing this Spec's Prompt and kicking off a fresh run…", toolCalls: offlineToolCall("publish_spec", {}) };
  }

  if (/\b(run (it )?again|re-?run|run the suite)\b/i.test(text)) {
    if (!spec.target) return { content: "There's no Prompt to run yet — want me to generate one first?" };
    return { content: "Running the eval suite again…", toolCalls: offlineToolCall("run_suite", { scope: "full" }) };
  }

  if (/\b(review insight|what should i (look at|review)|how (can|do) i improve)\b/i.test(text)) {
    if (spec.runs.length === 0) return { content: "There's no run yet to review — want me to run the suite first?" };
    return { content: "Taking a deeper look at the latest run's failures…", toolCalls: offlineToolCall("refresh_review_insights", {}) };
  }

  if (/\b(confus|frustrat|annoying|broken|doesn'?t work|love this|feedback|suggestion|bug)\b/i.test(text)) {
    return {
      content: "Thanks — I've logged that as feedback for the AI Studio team. Anything else on your mind?",
      toolCalls: offlineToolCall("log_feedback", { text }),
    };
  }

  if (/\b(generate|regenerate|make (the )?prompt|build the prompt)\b/i.test(text)) {
    // Scoped to whichever artifact(s) are explicitly named — "regenerate assertions" should only
    // touch Assertions, not silently clobber an already-good Prompt/Dataset too. Falls back to all
    // three when none are named (e.g. a bare "generate it").
    const prompt = /\bprompts?\b/.test(lower);
    const assertions = /\bassertions?\b/.test(lower);
    const dataset = /\bdatasets?\b/.test(lower);
    const scoped = prompt || assertions || dataset;
    const selection = scoped ? { prompt, assertions, dataset } : { prompt: true, assertions: true, dataset: true };
    const labels = [
      selection.prompt && "the Prompt",
      selection.assertions && "Assertions",
      selection.dataset && "a Dataset",
    ].filter(Boolean);
    return {
      content: `Generating ${labels.join(", ")} from the current brief…`,
      toolCalls: offlineToolCall("generate_artifacts", selection),
    };
  }

  return { content: offlineAssistantReply(opts.tab ?? undefined) };
}
