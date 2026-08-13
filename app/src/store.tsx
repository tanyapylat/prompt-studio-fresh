import { createContext, useContext, useReducer, type ReactNode } from "react";
import type {
  Library,
  LibraryAssertion,
  LibraryDataset,
  LibraryJudgePolicy,
  LibraryKind,
  LibraryVisibility,
  MockUser,
  Prompt,
  PromptDraft,
  SpecProject,
} from "./types";
import { seedLibrary, seedPrompts, seedSpecs, seedUsers, USER_VERONICA } from "./seed";
import { applyLibraryAssertionToSpec, applyLibraryDatasetToSpec, applyLibraryJudgeToSpec } from "./libraryFactory";
import { applyPromptEditToSpec } from "./specFactory";
import {
  activePromptVersion,
  addStandalonePromptVersion,
  createStandalonePrompt,
  duplicateAsStandalonePrompt,
  mirrorPromptFromSpec,
  mirrorPromptIdForSpec,
  type DuplicatePromptMeta,
  type PromptVersionPatch,
} from "./promptFactory";

type LibraryEntry = LibraryAssertion | LibraryDataset | LibraryJudgePolicy;

interface State {
  specs: SpecProject[];
  selectedId: string | null;
  prompts: Prompt[];
  selectedPromptId: string | null;
  /** Which version the Playground should open on, when it was entered from a version list. */
  selectedPromptVersionId: string | null;
  library: Library;
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
  | { type: "deleteLibraryEntry"; kind: LibraryKind; id: string }
  | { type: "selectPrompt"; id: string | null; versionId?: string | null }
  | { type: "createPrompt"; name: string; ownerId: string; visibility?: LibraryVisibility }
  | { type: "savePromptDraft"; promptId: string; draft: PromptDraft | null }
  | { type: "savePromptVersion"; promptId: string; patch: PromptVersionPatch }
  | { type: "insertPromptIntoSpec"; specId: string; sourcePromptId: string }
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
      const specs = state.specs.map((s) => (s.id === action.id ? action.updater(s) : s));
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
    case "deleteLibraryEntry":
      return {
        ...state,
        library: updateLibraryList(state.library, action.kind, (list) => list.filter((e) => e.id !== action.id)),
      };
    case "pinFromLibrary": {
      const entry = (state.library[action.kind] as LibraryEntry[]).find((e) => e.id === action.libraryId);
      if (!entry) return state;
      return {
        ...state,
        specs: state.specs.map((s) => {
          if (s.id !== action.specId) return s;
          switch (action.kind) {
            case "assertions":
              return applyLibraryAssertionToSpec(s, entry as LibraryAssertion);
            case "datasets":
              return applyLibraryDatasetToSpec(s, entry as LibraryDataset, action.datasetMode ?? "append");
            case "judgePolicies":
              return applyLibraryJudgeToSpec(s, entry as LibraryJudgePolicy);
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
    case "insertPromptIntoSpec": {
      const source = state.prompts.find((p) => p.id === action.sourcePromptId);
      const spec = state.specs.find((s) => s.id === action.specId);
      if (!source || !spec) return state;
      const version = activePromptVersion(source);
      const specs = state.specs.map((s) =>
        s.id === action.specId
          ? applyPromptEditToSpec(
              s,
              {
                promptContent: version.promptContent,
                model: version.model,
                temperature: version.temperature,
                messages: version.messages,
                tools: version.tools,
                outputSchema: version.outputSchema,
              },
              source.id,
            )
          : s,
      );
      const updatedSpec = specs.find((s) => s.id === action.specId);
      return { ...state, specs, prompts: updatedSpec ? syncPromptForSpec(state.prompts, updatedSpec) : state.prompts };
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
  deleteLibraryEntry: (kind: LibraryKind, id: string) => void;
  selectPrompt: (id: string | null, versionId?: string | null) => void;
  createPrompt: (name: string, ownerId: string, visibility?: LibraryVisibility) => void;
  savePromptDraft: (promptId: string, draft: PromptDraft | null) => void;
  savePromptVersion: (promptId: string, patch: PromptVersionPatch) => void;
  insertPromptIntoSpec: (specId: string, sourcePromptId: string) => void;
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
    deleteLibraryEntry: (kind, id) => dispatch({ type: "deleteLibraryEntry", kind, id }),
    selectPrompt: (id, versionId) => dispatch({ type: "selectPrompt", id, versionId }),
    createPrompt: (name, ownerId, visibility) => dispatch({ type: "createPrompt", name, ownerId, visibility }),
    savePromptDraft: (promptId, draft) => dispatch({ type: "savePromptDraft", promptId, draft }),
    savePromptVersion: (promptId, patch) => dispatch({ type: "savePromptVersion", promptId, patch }),
    insertPromptIntoSpec: (specId, sourcePromptId) => dispatch({ type: "insertPromptIntoSpec", specId, sourcePromptId }),
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
