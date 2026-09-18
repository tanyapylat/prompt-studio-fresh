import type { SpecProject } from "./types";
import { finalizeRun } from "./engine";
import { runSuiteRemote } from "./api";

/**
 * One atomic Publish: publishes the current Target (the Spec's Prompt version — this is what
 * makes the Spec itself count as published, see `isSpecPublished`), then auto-triggers a run.
 * `ranByUserId` stamps who triggered it (see `RunGroup.ranByUserId`) — falls back to the Spec's
 * own owner when the caller has no real "current user" to pass.
 */
export async function publishSpec(spec: SpecProject, signal?: AbortSignal, ranByUserId?: string): Promise<SpecProject> {
  const published: SpecProject = {
    ...spec,
    target: spec.target ? { ...spec.target, status: "published" as const } : null,
    updatedAt: Date.now(),
  };
  const { results, mode } = await runSuiteRemote(published, undefined, signal);
  const run = finalizeRun(results, mode, "full", published.target?.id, ranByUserId ?? spec.ownerId);
  return { ...published, runs: [...published.runs, run] };
}
