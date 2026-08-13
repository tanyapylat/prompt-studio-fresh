import type { SpecProject } from "./types";
import { finalizeRun } from "./engine";
import { runSuiteRemote } from "./api";

/** One atomic Publish: freezes the whole graph, then auto-triggers the first citable run. */
export async function publishSpec(spec: SpecProject): Promise<SpecProject> {
  const published: SpecProject = {
    ...spec,
    status: "published",
    assertions: spec.assertions.map((a) => ({ ...a, status: "published" as const })),
    target: spec.target ? { ...spec.target, status: "published" as const } : null,
    datasetStatus: "published",
    evalStatus: "published",
    updatedAt: Date.now(),
  };
  const { results, mode } = await runSuiteRemote(published);
  const citableRun = finalizeRun(published, results, mode);
  return { ...published, runs: [...published.runs, citableRun] };
}
