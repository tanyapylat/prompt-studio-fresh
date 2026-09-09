import type { RunGroup, SpecProject } from "./types";

/**
 * Quality/safety-style metrics shown in Review, distinct from the per-Requirement `Assertion`
 * scores in Eval/Results — those check *this dataset's* rows against *this Spec's* rules;
 * metrics here check something about the run/config as a whole. Starting with Relevancy
 * (ported from Prompt Studio's approval gate, see below); more will land here over time
 * (e.g. groundedness, toxicity) without changing how Review consumes them.
 */
export interface ReviewMetric {
  key: string;
  label: string;
  /** 0–1 */
  score: number;
  passed: boolean;
  description: string;
}

function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  return (Math.abs(h) % 1000) / 1000;
}

/**
 * Prompt Studio calculates this via a real LLM-as-judge call before Approve/Publish can complete
 * (`CalculateEvalRelevancyCommandHandler`) — it blocks on a *failed call*, not on a low score
 * (there's no minimum threshold there). This prototype doesn't wire up that judge call; it
 * emulates a stable, plausible score per run so the metric has a home in Review ahead of that
 * integration landing for real.
 */
function computeRelevancyScore(spec: SpecProject, run: RunGroup): number {
  const jitter = seededRandom(`${spec.id}:${run.id}:relevancy`);
  return Math.round((0.78 + jitter * 0.22) * 100) / 100; // usually lands 0.78–1.00
}

export function computeReviewMetrics(spec: SpecProject, run: RunGroup): ReviewMetric[] {
  const relevancy = computeRelevancyScore(spec, run);
  return [
    {
      key: "relevancy",
      label: "Eval relevancy",
      score: relevancy,
      passed: relevancy > 0,
      description:
        "LLM-as-judge check that the final eval configuration is actually relevant to this Spec/Prompt — carried over from Prompt Studio's approval gate.",
    },
  ];
}
