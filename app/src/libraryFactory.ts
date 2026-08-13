import type {
  Assertion,
  DatasetItem,
  JudgePolicy,
  LibraryAssertion,
  LibraryDataset,
  LibraryJudgePolicy,
  LibraryVisibility,
  SpecProject,
} from "./types";
import { newId } from "./utils/id";
import { markEdited } from "./specFactory";

export interface SaveToLibraryMeta {
  name: string;
  description: string;
  tags: string[];
  visibility: LibraryVisibility;
  ownerId: string;
}

function baseMeta(meta: SaveToLibraryMeta, sourceSpecId: string | null) {
  const now = Date.now();
  return {
    id: newId("lib"),
    name: meta.name,
    description: meta.description,
    tags: meta.tags,
    ownerId: meta.ownerId,
    visibility: meta.visibility,
    usageCount: 0,
    usedInSpecIds: [] as string[],
    sourceSpecId,
    createdAt: now,
    updatedAt: now,
  };
}

// ---- Save: Spec content -> a new Library entry -----------------------------------------------

export function assertionToLibraryEntry(
  assertion: Assertion,
  spec: SpecProject,
  meta: SaveToLibraryMeta,
): LibraryAssertion {
  return {
    ...baseMeta(meta, spec.id),
    tier: assertion.tier,
    description: assertion.description,
    check: assertion.check,
    rubric: assertion.rubric,
    code: assertion.code,
    codeLanguage: assertion.codeLanguage,
    group: assertion.group,
    passThreshold: assertion.passThreshold,
  };
}

export function datasetToLibraryEntry(spec: SpecProject, meta: SaveToLibraryMeta): LibraryDataset {
  if (spec.dataset.length === 0) throw new Error("Spec has no Dataset rows to save yet.");
  return {
    ...baseMeta(meta, spec.id),
    items: spec.dataset.map((it) => ({ ...it, id: newId("item") })),
  };
}

export function judgeToLibraryEntry(spec: SpecProject, meta: SaveToLibraryMeta): LibraryJudgePolicy {
  if (!spec.judge) throw new Error("Spec has no Judge Policy to save yet.");
  return {
    ...baseMeta(meta, spec.id),
    model: spec.judge.model,
    systemPrompt: spec.judge.systemPrompt,
    temperature: spec.judge.temperature,
  };
}

// ---- Load: a Library entry -> a copy applied onto a Spec (copy-on-pin, not a live link) -------

export function applyLibraryAssertionToSpec(spec: SpecProject, entry: LibraryAssertion): SpecProject {
  const assertion: Assertion = {
    id: newId("assert"),
    sourceCriterionId: null,
    tier: entry.tier,
    description: entry.description,
    check: entry.check,
    rubric: entry.rubric,
    code: entry.code,
    codeLanguage: entry.codeLanguage,
    status: "draft",
    libraryOrigin: entry.id,
    group: entry.group,
    passThreshold: entry.passThreshold,
  };
  return markEdited({ ...spec, assertions: [...spec.assertions, assertion], updatedAt: Date.now() });
}

export function applyLibraryDatasetToSpec(
  spec: SpecProject,
  entry: LibraryDataset,
  mode: "append" | "replace",
): SpecProject {
  const copied: DatasetItem[] = entry.items.map((it) => ({ ...it, id: newId("item") }));
  return markEdited({
    ...spec,
    dataset: mode === "replace" ? copied : [...spec.dataset, ...copied],
    datasetStatus: "draft",
    datasetLibraryOrigin: entry.id,
    updatedAt: Date.now(),
  });
}

export function applyLibraryJudgeToSpec(spec: SpecProject, entry: LibraryJudgePolicy): SpecProject {
  const judge: JudgePolicy = {
    id: newId("judge"),
    model: entry.model,
    libraryOrigin: entry.id,
    systemPrompt: entry.systemPrompt,
    temperature: entry.temperature,
  };
  return markEdited({ ...spec, judge, updatedAt: Date.now() });
}
