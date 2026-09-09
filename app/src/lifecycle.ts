import type { SpecProject } from "./types";
import { finalizeRun } from "./engine";
import { runSuiteRemote } from "./api";

/**
 * One atomic Publish: publishes the current Target (the Spec's Prompt version — this is what
 * makes the Spec itself count as published, see `isSpecPublished`), then auto-triggers a run.
 */
export async function publishSpec(spec: SpecProject, signal?: AbortSignal): Promise<SpecProject> {
  const published: SpecProject = {
    ...spec,
    target: spec.target ? { ...spec.target, status: "published" as const } : null,
    updatedAt: Date.now(),
  };
  const { results, mode } = await runSuiteRemote(published, undefined, signal);
  const run = finalizeRun(results, mode);
  return { ...published, runs: [...published.runs, run] };
}
