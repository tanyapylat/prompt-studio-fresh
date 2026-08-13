import type { SpecProject } from "./types";

export function computeCoverage(spec: SpecProject): { total: number; covered: number } {
  const all = [...spec.guardrails, ...spec.criteria];
  const covered = all.filter((c) => spec.assertions.some((a) => a.sourceCriterionId === c.id));
  return { total: all.length, covered: covered.length };
}
