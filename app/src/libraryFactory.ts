import type {
  Assertion,
  AssertionTier,
  DatasetItem,
  LibraryAssertion,
  LibraryDataset,
  LibraryVisibility,
  SpecProject,
} from "./types";
import { newId } from "./utils/id";
import { newAssertionManual, syncJudgePolicy } from "./specFactory";

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

// ---- Create directly in the library (no Spec involved) -----------------------------------------

/**
 * A brand-new Assertion authored straight into the library via "New Assertion" — not copied from
 * any Spec. Always starts private; `deterministic`/`custom_code` tiers can never go public (see
 * `canMakeAssertionPublic`), since those are engineer-owned check types, not free-text authoring.
 */
export function createLibraryAssertion(tier: AssertionTier, name: string, ownerId: string): LibraryAssertion {
  const now = Date.now();
  const draft = newAssertionManual(tier);
  return {
    id: newId("lib"),
    name,
    description: draft.description,
    tags: [],
    ownerId,
    visibility: "private",
    usageCount: 0,
    usedInSpecIds: [],
    sourceSpecId: null,
    createdAt: now,
    updatedAt: now,
    tier,
    check: draft.check,
    rubric: draft.rubric,
    code: draft.code,
    codeLanguage: draft.codeLanguage,
  };
}

/** `deterministic`/`custom_code` are engineer-owned check types — never publishable by users. */
export function canMakeAssertionPublic(entry: LibraryAssertion): boolean {
  return entry.tier === "rubric_grading";
}

/** A brand-new, empty Dataset authored straight into the library via "New Dataset". Always private. */
export function createLibraryDataset(name: string, ownerId: string, variableNames: string[]): LibraryDataset {
  const now = Date.now();
  return {
    id: newId("lib"),
    name,
    description: "",
    tags: [],
    ownerId,
    visibility: "private",
    usageCount: 0,
    usedInSpecIds: [],
    sourceSpecId: null,
    createdAt: now,
    updatedAt: now,
    items: [],
    variableNames: variableNames.length > 0 ? variableNames : ["input"],
  };
}

// ---- Load: a Library entry -> a copy applied onto a Spec (copy-on-pin, not a live link) -------

export function applyLibraryAssertionToSpec(spec: SpecProject, entry: LibraryAssertion): SpecProject {
  const assertion: Assertion = {
    id: newId("assert"),
    sourceRequirementId: null,
    tier: entry.tier,
    description: entry.description,
    check: entry.check,
    rubric: entry.rubric,
    code: entry.code,
    codeLanguage: entry.codeLanguage,
    libraryOrigin: entry.id,
    group: entry.group,
    passThreshold: entry.passThreshold,
  };
  return syncJudgePolicy({ ...spec, assertions: [...spec.assertions, assertion], updatedAt: Date.now() });
}

export function applyLibraryDatasetToSpec(
  spec: SpecProject,
  entry: LibraryDataset,
  mode: "append" | "replace",
): SpecProject {
  const copied: DatasetItem[] = entry.items.map((it) => ({ ...it, id: newId("item") }));
  return {
    ...spec,
    dataset: mode === "replace" ? copied : [...spec.dataset, ...copied],
    datasetLibraryOrigin: entry.id,
    updatedAt: Date.now(),
  };
}

