import type {
  LibraryVisibility,
  Prompt,
  PromptDraft,
  PromptOutputSchema,
  PromptSettings,
  PromptTool,
  PromptMessage,
  PromptVersion,
  SpecProject,
  Status,
  TargetVersion,
} from "./types";
import { newId } from "./utils/id";
import { DEFAULT_TARGET_MODEL, DEFAULT_TEMPERATURE } from "./engine";
import { defaultMessages, defaultOutputSchema, defaultPromptSettings } from "./promptTemplate";

/** Deterministic id so a Spec's Target always maps to the same PromptVersion row. */
export function versionIdForTarget(targetId: string): string {
  return `pv_${targetId}`;
}

/** Deterministic id so a Spec always mirrors to the same Prompt row — never duplicated. */
export function mirrorPromptIdForSpec(specId: string): string {
  return `prompt_${specId}`;
}

/**
 * Builds/updates the Prompt that mirrors a Spec's Target, so every Spec's prompt automatically
 * shows up in the unified Prompts catalog with its own version history. Keyed deterministically
 * off the Spec id (and each Target id for versions), so calling this again after any Spec update
 * is idempotent — it never creates duplicate Prompt or PromptVersion rows.
 * Returns null when the Spec has no Target yet — there's nothing to mirror.
 */
export function mirrorPromptFromSpec(spec: SpecProject, existing?: Prompt | null): Prompt | null {
  if (!spec.target) return existing ?? null;

  // promptHistory is newest-first; put it back in chronological order with the active target last.
  const chronological: TargetVersion[] = [...spec.promptHistory].reverse();
  const targets: TargetVersion[] = [...chronological, spec.target];

  const versions: PromptVersion[] = targets.map((t, i) => ({
    id: versionIdForTarget(t.id),
    version: i + 1,
    promptContent: t.promptContent,
    model: t.model,
    temperature: t.temperature,
    status: t.status,
    createdAt: t.createdAt ?? spec.createdAt,
    messages: t.messages ?? defaultMessages(t.promptContent),
    tools: t.tools ?? [],
    outputSchema: t.outputSchema ?? defaultOutputSchema(),
    settings: t.settings ?? defaultPromptSettings(),
  }));

  return {
    id: mirrorPromptIdForSpec(spec.id),
    name: spec.name,
    description: existing?.description ?? "",
    tags: existing?.tags ?? [],
    ownerId: spec.ownerId,
    visibility: spec.visibility,
    specId: spec.id,
    versions,
    activeVersionId: versionIdForTarget(spec.target.id),
    draft: reconcileDraft(existing?.draft, versions),
    createdAt: existing?.createdAt ?? spec.createdAt,
    updatedAt: spec.updatedAt,
  };
}

/**
 * Keeps an in-progress draft across Spec re-mirrors, but drops it once the version it branched
 * from no longer exists (e.g. the Spec was regenerated), so the Playground never shows edits
 * anchored to a version that's gone.
 */
function reconcileDraft(draft: PromptDraft | null | undefined, versions: PromptVersion[]): PromptDraft | null {
  if (!draft) return null;
  return versions.some((v) => v.id === draft.baseVersionId) ? draft : null;
}

/** A brand-new Prompt created directly from the Prompts catalog, independent of any Spec. */
export function createStandalonePrompt(
  name: string,
  ownerId: string,
  visibility: LibraryVisibility = "private",
): Prompt {
  const now = Date.now();
  const firstVersion: PromptVersion = {
    id: newId("pv"),
    version: 1,
    promptContent: "",
    model: DEFAULT_TARGET_MODEL,
    temperature: DEFAULT_TEMPERATURE,
    status: "draft",
    createdAt: now,
    messages: defaultMessages(""),
    tools: [],
    outputSchema: defaultOutputSchema(),
    settings: defaultPromptSettings(),
  };
  return {
    id: newId("prompt"),
    name,
    description: "",
    tags: [],
    ownerId,
    visibility,
    specId: null,
    versions: [firstVersion],
    activeVersionId: firstVersion.id,
    draft: null,
    createdAt: now,
    updatedAt: now,
  };
}

export interface PromptVersionPatch {
  promptContent: string;
  model: string;
  temperature: number;
  status?: Status;
  messages?: PromptMessage[];
  tools?: PromptTool[];
  outputSchema?: PromptOutputSchema;
  settings?: PromptSettings;
}

/**
 * Appends a new version to a standalone Prompt — history stays append-only, so "restoring" an
 * older version is just saving a new version whose content copies it, never a destructive rollback.
 * Spec-linked Prompts are versioned through the Spec's Target instead (see store.savePromptVersion),
 * since that also has to update the Spec itself.
 */
export function addStandalonePromptVersion(prompt: Prompt, patch: PromptVersionPatch): Prompt {
  const now = Date.now();
  const newVersion: PromptVersion = {
    id: newId("pv"),
    version: prompt.versions.length + 1,
    promptContent: patch.promptContent,
    model: patch.model,
    temperature: patch.temperature,
    status: patch.status ?? "draft",
    createdAt: now,
    messages: patch.messages ?? defaultMessages(patch.promptContent),
    tools: patch.tools ?? [],
    outputSchema: patch.outputSchema ?? defaultOutputSchema(),
    settings: patch.settings ?? defaultPromptSettings(),
  };
  return {
    ...prompt,
    versions: [...prompt.versions, newVersion],
    activeVersionId: newVersion.id,
    draft: null,
    updatedAt: now,
  };
}

export interface DuplicatePromptMeta {
  name: string;
  description: string;
  tags: string[];
  visibility: LibraryVisibility;
  ownerId: string;
}

/** Copies another Prompt's active version into a brand-new standalone Prompt — a snapshot, not a live link. */
export function duplicateAsStandalonePrompt(source: Prompt, meta: DuplicatePromptMeta): Prompt {
  const now = Date.now();
  const sourceVersion = activePromptVersion(source);
  const firstVersion: PromptVersion = {
    id: newId("pv"),
    version: 1,
    promptContent: sourceVersion.promptContent,
    model: sourceVersion.model,
    temperature: sourceVersion.temperature,
    status: "draft",
    createdAt: now,
    messages: sourceVersion.messages ?? defaultMessages(sourceVersion.promptContent),
    tools: sourceVersion.tools ?? [],
    outputSchema: sourceVersion.outputSchema ?? defaultOutputSchema(),
    settings: sourceVersion.settings ?? defaultPromptSettings(),
  };
  return {
    id: newId("prompt"),
    name: meta.name,
    description: meta.description,
    tags: meta.tags,
    ownerId: meta.ownerId,
    visibility: meta.visibility,
    specId: null,
    versions: [firstVersion],
    activeVersionId: firstVersion.id,
    draft: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function activePromptVersion(prompt: Prompt): PromptVersion {
  return prompt.versions.find((v) => v.id === prompt.activeVersionId) ?? prompt.versions[prompt.versions.length - 1];
}

/**
 * Publishes a standalone Prompt's active version in place — "published" for a Prompt means its
 * active version is published. Spec-linked Prompts publish through the Spec's Target instead (see
 * `lifecycle.publishSpec`), since publishing there also runs the Eval suite.
 */
export function publishActiveVersion(prompt: Prompt): Prompt {
  const now = Date.now();
  return {
    ...prompt,
    versions: prompt.versions.map((v) =>
      v.id === prompt.activeVersionId ? { ...v, status: "published" as const } : v,
    ),
    updatedAt: now,
  };
}

/** True when a draft actually diverges from the version it branched off — an empty diff isn't a draft. */
export function draftDiffersFromBase(prompt: Prompt): boolean {
  const draft = prompt.draft;
  if (!draft) return false;
  const base = prompt.versions.find((v) => v.id === draft.baseVersionId);
  if (!base) return false;
  return (
    draft.promptContent !== base.promptContent ||
    draft.model !== base.model ||
    draft.temperature !== base.temperature
  );
}
