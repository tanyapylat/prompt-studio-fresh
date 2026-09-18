import { createContext, useContext, useReducer, type ReactNode } from "react";
import type {
  Library,
  LibraryAssertion,
  LibraryDataset,
  LibraryKind,
  LibraryVisibility,
  MockUser,
  Prompt,
  PromptDraft,
  RunGroup,
  SpecProject,
} from "./types";
import { seedLibrary, seedPrompts, seedSpecs, seedUsers, USER_VERONICA } from "./seed";
import { applyLibraryAssertionToSpec, applyLibraryDatasetToSpec } from "./libraryFactory";
import { applyPromptEditToSpec, markArtifactManuallyEdited } from "./specFactory";
import {
  addStandalonePromptVersion,
  createStandalonePrompt,
  duplicateAsStandalonePrompt,
  mirrorPromptFromSpec,
  mirrorPromptIdForSpec,
  publishActiveVersion,
  type DuplicatePromptMeta,
  type PromptVersionPatch,
} from "./promptFactory";

type LibraryEntry = LibraryAssertion | LibraryDataset;

interface State {
  specs: SpecProject[];
  selectedId: string | null;
  prompts: Prompt[];
  selectedPromptId: string | null;
  /** Which version the Playground should open on, when it was entered from a version list. */
  selectedPromptVersionId: string | null;
  library: Library;
  /** Which library Dataset entry the Datasets full-page workspace should show, if any. */
  selectedLibraryDatasetId: string | null;
  /** Which Run the standalone Run Detail page should show, if any — a RunGroup id, globally unique across every Spec. */
  selectedRunId: string | null;
  users: MockUser[];
  currentUserId: string;
}

type Action =
  | { type: "select"; id: string | null }
  | { type: "add"; spec: SpecProject }
  | { type: "update"; id: string; updater: (s: SpecProject) => SpecProject }
  | { type: "remove"; id: string }
  | { type: "switchUser"; id: string }
  | { type: "saveToLibrary"; kind: LibraryKind; entry: LibraryEntry }
  | { type: "pinFromLibrary"; kind: LibraryKind; libraryId: string; specId: string; datasetMode?: "append" | "replace" }
  | { type: "setLibraryVisibility"; kind: LibraryKind; id: string; visibility: LibraryVisibility }
  | { type: "updateLibraryEntry"; kind: LibraryKind; id: string; updater: (e: LibraryEntry) => LibraryEntry }
  | { type: "deleteLibraryEntry"; kind: LibraryKind; id: string }
  | { type: "selectLibraryDataset"; id: string | null }
  | { type: "selectRun"; id: string | null }
  | { type: "selectPrompt"; id: string | null; versionId?: string | null }
  | { type: "createPrompt"; name: string; ownerId: string; visibility?: LibraryVisibility }
  | { type: "savePromptDraft"; promptId: string; draft: PromptDraft | null }
  | { type: "savePromptVersion"; promptId: string; patch: PromptVersionPatch }
  | { type: "publishPrompt"; id: string }
  | { type: "duplicatePromptAsStandalone"; sourcePromptId: string; meta: DuplicatePromptMeta }
  | { type: "updatePromptMeta"; id: string; updater: (p: Prompt) => Prompt }
  | { type: "deletePrompt"; id: string };

function updateLibraryList(library: Library, kind: LibraryKind, fn: (list: LibraryEntry[]) => LibraryEntry[]): Library {
  return { ...library, [kind]: fn(library[kind] as LibraryEntry[]) } as Library;
}

/** Upserts the Prompt mirrored from `spec` into `prompts` — a no-op if the Spec has no Target yet. */
function syncPromptForSpec(prompts: Prompt[], spec: SpecProject): Prompt[] {
  const mirroredId = mirrorPromptIdForSpec(spec.id);
  const existing = prompts.find((p) => p.id === mirroredId) ?? null;
  const mirrored = mirrorPromptFromSpec(spec, existing);
  if (!mirrored) return prompts;
  const idx = prompts.findIndex((p) => p.id === mirrored.id);
  if (idx === -1) return [mirrored, ...prompts];
  return prompts.map((p, i) => (i === idx ? mirrored : p));
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "select":
      return { ...state, selectedId: action.id };
    case "add":
      return {
        ...state,
        specs: [action.spec, ...state.specs],
        selectedId: action.spec.id,
        prompts: syncPromptForSpec(state.prompts, action.spec),
      };
    case "update": {
      const specs = state.specs.map((s) =>
        s.id === action.id ? { ...action.updater(s), updatedByUserId: state.currentUserId } : s,
      );
      const updated = specs.find((s) => s.id === action.id);
      return { ...state, specs, prompts: updated ? syncPromptForSpec(state.prompts, updated) : state.prompts };
    }
    case "remove": {
      const mirroredId = mirrorPromptIdForSpec(action.id);
      return {
        ...state,
        specs: state.specs.filter((s) => s.id !== action.id),
        selectedId: state.selectedId === action.id ? null : state.selectedId,
        prompts: state.prompts.filter((p) => p.id !== mirroredId),
        selectedPromptId: state.selectedPromptId === mirroredId ? null : state.selectedPromptId,
        selectedPromptVersionId: state.selectedPromptId === mirroredId ? null : state.selectedPromptVersionId,
      };
    }
    case "switchUser":
      return { ...state, currentUserId: action.id };
    case "saveToLibrary":
      return { ...state, library: updateLibraryList(state.library, action.kind, (list) => [action.entry, ...list]) };
    case "setLibraryVisibility":
      return {
        ...state,
        library: updateLibraryList(state.library, action.kind, (list) =>
          list.map((e) => (e.id === action.id ? { ...e, visibility: action.visibility, updatedAt: Date.now() } : e)),
        ),
      };
    case "updateLibraryEntry":
      return {
        ...state,
        library: updateLibraryList(state.library, action.kind, (list) =>
          list.map((e) => (e.id === action.id ? action.updater(e) : e)),
        ),
      };
    case "deleteLibraryEntry":
      return {
        ...state,
        library: updateLibraryList(state.library, action.kind, (list) => list.filter((e) => e.id !== action.id)),
        selectedLibraryDatasetId: state.selectedLibraryDatasetId === action.id ? null : state.selectedLibraryDatasetId,
      };
    case "selectLibraryDataset":
      return { ...state, selectedLibraryDatasetId: action.id };
    case "selectRun":
      return { ...state, selectedRunId: action.id };
    case "pinFromLibrary": {
      const entry = (state.library[action.kind] as LibraryEntry[]).find((e) => e.id === action.libraryId);
      if (!entry) return state;
      return {
        ...state,
        specs: state.specs.map((s) => {
          if (s.id !== action.specId) return s;
          switch (action.kind) {
            case "assertions":
              // Loading from the Library isn't a Generate call either — it's still a hand
              // pick, so it counts as a manual edit for staleness purposes.
              return markArtifactManuallyEdited(applyLibraryAssertionToSpec(s, entry as LibraryAssertion), "assertions");
            case "datasets":
              return markArtifactManuallyEdited(
                applyLibraryDatasetToSpec(s, entry as LibraryDataset, action.datasetMode ?? "append"),
                "dataset",
              );
            default:
              return s;
          }
        }),
        library: updateLibraryList(state.library, action.kind, (list) =>
          list.map((e) =>
            e.id === action.libraryId
              ? {
                  ...e,
                  usageCount: e.usageCount + 1,
                  usedInSpecIds: e.usedInSpecIds.includes(action.specId)
                    ? e.usedInSpecIds
                    : [...e.usedInSpecIds, action.specId],
                }
              : e,
          ),
        ),
      };
    }
    case "selectPrompt":
      return { ...state, selectedPromptId: action.id, selectedPromptVersionId: action.versionId ?? null };
    case "createPrompt": {
      const prompt = createStandalonePrompt(action.name, action.ownerId, action.visibility);
      return {
        ...state,
        prompts: [prompt, ...state.prompts],
        selectedPromptId: prompt.id,
        selectedPromptVersionId: null,
      };
    }
    case "savePromptDraft":
      return {
        ...state,
        prompts: state.prompts.map((p) => (p.id === action.promptId ? { ...p, draft: action.draft } : p)),
      };
    case "savePromptVersion": {
      const prompt = state.prompts.find((p) => p.id === action.promptId);
      if (!prompt) return state;
      // Committing the edits retires whatever draft they came from.
      const cleared = state.prompts.map((p) => (p.id === prompt.id ? { ...p, draft: null } : p));
      // The freshly saved version becomes what the Playground shows, overriding any version the
      // author originally opened it on.
      if (prompt.specId) {
        const specs = state.specs.map((s) => (s.id === prompt.specId ? applyPromptEditToSpec(s, action.patch) : s));
        const spec = specs.find((s) => s.id === prompt.specId);
        return {
          ...state,
          specs,
          prompts: spec ? syncPromptForSpec(cleared, spec) : cleared,
          selectedPromptVersionId: null,
        };
      }
      const updated = addStandalonePromptVersion(prompt, action.patch);
      return {
        ...state,
        prompts: cleared.map((p) => (p.id === prompt.id ? updated : p)),
        selectedPromptVersionId: null,
      };
    }
    case "publishPrompt": {
      const prompt = state.prompts.find((p) => p.id === action.id);
      // Spec-linked Prompts publish through the Spec's Target (see lifecycle.publishSpec).
      if (!prompt || prompt.specId) return state;
      return { ...state, prompts: state.prompts.map((p) => (p.id === prompt.id ? publishActiveVersion(p) : p)) };
    }
    case "duplicatePromptAsStandalone": {
      const source = state.prompts.find((p) => p.id === action.sourcePromptId);
      if (!source) return state;
      const prompt = duplicateAsStandalonePrompt(source, action.meta);
      return { ...state, prompts: [prompt, ...state.prompts] };
    }
    case "updatePromptMeta":
      return { ...state, prompts: state.prompts.map((p) => (p.id === action.id ? action.updater(p) : p)) };
    case "deletePrompt":
      return {
        ...state,
        prompts: state.prompts.filter((p) => p.id !== action.id),
        selectedPromptId: state.selectedPromptId === action.id ? null : state.selectedPromptId,
        selectedPromptVersionId: state.selectedPromptId === action.id ? null : state.selectedPromptVersionId,
      };
    default:
      return state;
  }
}

interface StoreValue {
  specs: SpecProject[];
  selectedId: string | null;
  selected: SpecProject | null;
  prompts: Prompt[];
  selectedPromptId: string | null;
  selectedPrompt: Prompt | null;
  selectedPromptVersionId: string | null;
  library: Library;
  selectedLibraryDatasetId: string | null;
  selectedLibraryDataset: LibraryDataset | null;
  selectedRunId: string | null;
  /** The Spec that owns `selectedRunId` and the matching RunGroup itself, or null if nothing is selected. */
  selectedRun: { spec: SpecProject; run: RunGroup } | null;
  users: MockUser[];
  currentUserId: string;
  currentUser: MockUser;
  select: (id: string | null) => void;
  addSpec: (spec: SpecProject) => void;
  updateSpec: (id: string, updater: (s: SpecProject) => SpecProject) => void;
  removeSpec: (id: string) => void;
  switchUser: (id: string) => void;
  saveToLibrary: (kind: LibraryKind, entry: LibraryEntry) => void;
  pinFromLibrary: (kind: LibraryKind, libraryId: string, specId: string, datasetMode?: "append" | "replace") => void;
  setLibraryVisibility: (kind: LibraryKind, id: string, visibility: LibraryVisibility) => void;
  updateLibraryEntry: (kind: LibraryKind, id: string, updater: (e: LibraryEntry) => LibraryEntry) => void;
  deleteLibraryEntry: (kind: LibraryKind, id: string) => void;
  selectLibraryDataset: (id: string | null) => void;
  selectRun: (id: string | null) => void;
  selectPrompt: (id: string | null, versionId?: string | null) => void;
  createPrompt: (name: string, ownerId: string, visibility?: LibraryVisibility) => void;
  savePromptDraft: (promptId: string, draft: PromptDraft | null) => void;
  savePromptVersion: (promptId: string, patch: PromptVersionPatch) => void;
  publishPrompt: (id: string) => void;
  duplicatePromptAsStandalone: (sourcePromptId: string, meta: DuplicatePromptMeta) => void;
  updatePromptMeta: (id: string, updater: (p: Prompt) => Prompt) => void;
  deletePrompt: (id: string) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const specs = seedSpecs();
    return {
      specs,
      selectedId: null,
      prompts: seedPrompts(specs),
      selectedPromptId: null,
      selectedPromptVersionId: null,
      library: seedLibrary(),
      selectedLibraryDatasetId: null,
      selectedRunId: null,
      users: seedUsers(),
      currentUserId: USER_VERONICA,
    };
  });

  const value: StoreValue = {
    specs: state.specs,
    selectedId: state.selectedId,
    selected: state.specs.find((s) => s.id === state.selectedId) ?? null,
    prompts: state.prompts,
    selectedPromptId: state.selectedPromptId,
    selectedPrompt: state.prompts.find((p) => p.id === state.selectedPromptId) ?? null,
    selectedPromptVersionId: state.selectedPromptVersionId,
    library: state.library,
    selectedLibraryDatasetId: state.selectedLibraryDatasetId,
    selectedLibraryDataset: state.library.datasets.find((d) => d.id === state.selectedLibraryDatasetId) ?? null,
    selectedRunId: state.selectedRunId,
    selectedRun: (() => {
      if (!state.selectedRunId) return null;
      for (const spec of state.specs) {
        const run = spec.runs.find((r) => r.id === state.selectedRunId);
        if (run) return { spec, run };
      }
      return null;
    })(),
    users: state.users,
    currentUserId: state.currentUserId,
    currentUser: state.users.find((u) => u.id === state.currentUserId) ?? state.users[0],
    select: (id) => dispatch({ type: "select", id }),
    addSpec: (spec) => dispatch({ type: "add", spec }),
    updateSpec: (id, updater) => dispatch({ type: "update", id, updater }),
    removeSpec: (id) => dispatch({ type: "remove", id }),
    switchUser: (id) => dispatch({ type: "switchUser", id }),
    saveToLibrary: (kind, entry) => dispatch({ type: "saveToLibrary", kind, entry }),
    pinFromLibrary: (kind, libraryId, specId, datasetMode) =>
      dispatch({ type: "pinFromLibrary", kind, libraryId, specId, datasetMode }),
    setLibraryVisibility: (kind, id, visibility) => dispatch({ type: "setLibraryVisibility", kind, id, visibility }),
    updateLibraryEntry: (kind, id, updater) => dispatch({ type: "updateLibraryEntry", kind, id, updater }),
    deleteLibraryEntry: (kind, id) => dispatch({ type: "deleteLibraryEntry", kind, id }),
    selectLibraryDataset: (id) => dispatch({ type: "selectLibraryDataset", id }),
    selectRun: (id) => dispatch({ type: "selectRun", id }),
    selectPrompt: (id, versionId) => dispatch({ type: "selectPrompt", id, versionId }),
    createPrompt: (name, ownerId, visibility) => dispatch({ type: "createPrompt", name, ownerId, visibility }),
    savePromptDraft: (promptId, draft) => dispatch({ type: "savePromptDraft", promptId, draft }),
    savePromptVersion: (promptId, patch) => dispatch({ type: "savePromptVersion", promptId, patch }),
    publishPrompt: (id) => dispatch({ type: "publishPrompt", id }),
    duplicatePromptAsStandalone: (sourcePromptId, meta) => dispatch({ type: "duplicatePromptAsStandalone", sourcePromptId, meta }),
    updatePromptMeta: (id, updater) => dispatch({ type: "updatePromptMeta", id, updater }),
    deletePrompt: (id) => dispatch({ type: "deletePrompt", id }),
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
