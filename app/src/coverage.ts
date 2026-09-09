import type { SpecProject } from "./types";

export function computeCoverage(spec: SpecProject): { total: number; covered: number } {
  const all = spec.requirements;
  const covered = all.filter((r) => spec.assertions.some((a) => a.sourceRequirementId === r.id));
  return { total: all.length, covered: covered.length };
}
