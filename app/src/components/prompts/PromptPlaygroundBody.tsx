import { useEffect, useMemo, useRef, useState } from "react";
import {
  Braces,
  ChevronDown,
  ChevronRight,
  History,
  Loader2,
  Paperclip,
  Play,
  Plus,
  Save,
  Trash2,
  Undo2,
  Wrench,
  Zap,
  ZapOff,
} from "lucide-react";
import { useStore } from "../../store";
import { activePromptVersion } from "../../promptFactory";
import { checkApiHealth, runPlaygroundRemote, type PlaygroundChatMessage, type PlaygroundToolCall } from "../../api";
import {
  defaultMessages,
  defaultOutputSchema,
  emptyTool,
  extractVariableNames,
  flattenSystemContent,
  substituteVariables,
} from "../../promptTemplate";
import type { Prompt, PromptDraft, PromptMessage, PromptOutputSchema, PromptRole, PromptTool } from "../../types";
import { newId } from "../../utils/id";
import { AutoGrowTextArea, Badge, Button, TextInput } from "../ui";

export const MODELS = ["gpt-4o-mini", "gpt-4o", "claude-3-7-sonnet", "gemini-1.5-pro"];

const ROLE_LABEL: Record<PromptRole, string> = { system: "System", human: "Human", ai: "AI" };
const ROLE_TO_API: Record<PromptRole, "system" | "user" | "assistant"> = {
  system: "system",
  human: "user",
  ai: "assistant",
};

/** How long editing pauses before the working copy is persisted onto the Prompt. */
const DRAFT_PERSIST_MS = 400;

interface Draft {
  messages: PromptMessage[];
  model: string;
  temperature: number;
  tools: PromptTool[];
  outputSchema: PromptOutputSchema;
}

interface VersionLike {
  promptContent: string;
  model: string;
  temperature: number;
  messages?: PromptMessage[];
  tools?: PromptTool[];
  outputSchema?: PromptOutputSchema;
}

function draftFromVersion(v: VersionLike): Draft {
  return {
    messages: v.messages ?? defaultMessages(v.promptContent),
    model: v.model,
    temperature: v.temperature,
    tools: v.tools ?? [],
    outputSchema: v.outputSchema ?? defaultOutputSchema(),
  };
}

function sameMessages(a: PromptMessage[], b: PromptMessage[]): boolean {
  return a.length === b.length && a.every((m, i) => m.role === b[i].role && m.content === b[i].content);
}

function sameTools(a: PromptTool[], b: PromptTool[]): boolean {
  return (
    a.length === b.length &&
    a.every((t, i) => t.name === b[i].name && t.description === b[i].description && t.parameters === b[i].parameters)
  );
}

function sameOutputSchema(a: PromptOutputSchema, b: PromptOutputSchema): boolean {
  return a.enabled === b.enabled && a.name === b.name && a.schema === b.schema;
}

/** Structural comparison (ignoring message/tool ids), since the draft can add/remove/reorder rows. */
function sameContent(a: Draft, b: VersionLike): boolean {
  const other = draftFromVersion(b);
  return (
    a.model === other.model &&
    a.temperature === other.temperature &&
    sameMessages(a.messages, other.messages) &&
    sameTools(a.tools, other.tools) &&
    sameOutputSchema(a.outputSchema, other.outputSchema)
  );
}

/**
 * What the editor shows on open: the version the caller asked for, or else the unsaved draft
 * (on top of the version it branched from), or else the current version.
 */
function openingState(prompt: Prompt, requestedVersionId?: string | null): { versionId: string; draft: Draft } {
  const resumed = requestedVersionId ? null : prompt.draft;
  const versionId = resumed?.baseVersionId ?? requestedVersionId ?? prompt.activeVersionId;
  const version = prompt.versions.find((v) => v.id === versionId) ?? activePromptVersion(prompt);
  return { versionId: version.id, draft: draftFromVersion(resumed ?? version) };
}

function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsText(file);
  });
}

/** Reads a local text file and hands its contents back — used both on messages and on variable values. */
function FileAttachButton({ title, onText }: { title: string; onText: (text: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        title={title}
        onClick={() => inputRef.current?.click()}
        className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        <Paperclip size={13} />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.json,.csv,.log,text/plain"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          readTextFile(file)
            .then(onText)
            .catch(() => {});
        }}
      />
    </>
  );
}

function isValidJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * The shared editor + ad-hoc tester used both by the full-page Prompt Playground and embedded
 * inside a Spec's Prompt tab — same UI either way (requirement: "same playground when opened from
 * a spec"). Editing never mints anything: the working copy is kept as a draft on the Prompt, so
 * you can experiment and test freely and only commit an immutable PromptVersion when you choose to.
 * For a Spec-linked Prompt, that commit also forks the underlying Spec back to draft.
 */
export function PromptPlaygroundBody({
  prompt,
  initialVersionId,
}: {
  prompt: Prompt;
  initialVersionId?: string | null;
}) {
  const { savePromptDraft, savePromptVersion } = useStore();
  const active = activePromptVersion(prompt);

  const [viewingVersionId, setViewingVersionId] = useState(() => openingState(prompt, initialVersionId).versionId);
  const [draft, setDraft] = useState<Draft>(() => openingState(prompt, initialVersionId).draft);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [collapsedMessageIds, setCollapsedMessageIds] = useState<Set<string>>(() => new Set());
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [schemaExpanded, setSchemaExpanded] = useState(false);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [testBusy, setTestBusy] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [testToolCalls, setTestToolCalls] = useState<PlaygroundToolCall[] | null>(null);

  useEffect(() => {
    checkApiHealth().then((h) => setHasApiKey(h.hasApiKey));
  }, []);

  // Only edits made here are written back to the store, so merely opening an older version can
  // never wipe a draft the author left behind on a different one.
  const editedRef = useRef(false);

  function openVersion(version: VersionLike & { id: string }) {
    setViewingVersionId(version.id);
    setDraft(draftFromVersion(version));
    editedRef.current = false;
  }

  function editDraft(patch: Partial<Draft>) {
    editedRef.current = true;
    setDraft((d) => ({ ...d, ...patch }));
  }

  // Reopen from scratch whenever a save lands (versions.length just grew), when the caller asks for
  // a specific version, or when switching to a different Prompt entirely — resuming the stored
  // draft if there is one. Picking a version from the dropdown is handled by its own onChange.
  useEffect(() => {
    const next = openingState(prompt, initialVersionId);
    setViewingVersionId(next.versionId);
    setDraft(next.draft);
    editedRef.current = false;
    setTestOutput(null);
    setTestToolCalls(null);
    setTestError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt.id, prompt.versions.length, initialVersionId]);

  const viewingVersion = useMemo(
    () => prompt.versions.find((v) => v.id === viewingVersionId) ?? active,
    [prompt.versions, viewingVersionId, active],
  );

  const isDirty = !sameContent(draft, viewingVersion);

  // Persist the working copy so leaving the Playground (or the Spec tab) never loses edits and
  // never silently mints a version. Debounced so typing doesn't churn the store on every keystroke.
  const storedDraftRef = useRef<PromptDraft | null>(prompt.draft ?? null);
  storedDraftRef.current = prompt.draft ?? null;

  useEffect(() => {
    if (!editedRef.current) return;
    const timer = window.setTimeout(() => {
      const current = storedDraftRef.current;
      if (!isDirty) {
        if (current && current.baseVersionId === viewingVersion.id) savePromptDraft(prompt.id, null);
        return;
      }
      savePromptDraft(prompt.id, {
        promptContent: flattenSystemContent(draft.messages),
        model: draft.model,
        temperature: draft.temperature,
        messages: draft.messages,
        tools: draft.tools,
        outputSchema: draft.outputSchema,
        baseVersionId: viewingVersion.id,
        updatedAt: Date.now(),
      });
    }, DRAFT_PERSIST_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, isDirty, prompt.id, viewingVersion.id]);

  function handleSelectVersion(versionId: string) {
    const version = prompt.versions.find((v) => v.id === versionId);
    if (!version) return;
    if (isDirty) {
      if (!window.confirm("Open this version and discard your unsaved draft?")) return;
      savePromptDraft(prompt.id, null);
    }
    openVersion(version);
  }

  function handleDiscardDraft() {
    if (!window.confirm("Discard your unsaved edits and go back to this version?")) return;
    savePromptDraft(prompt.id, null);
    openVersion(viewingVersion);
  }

  const hasContent = draft.messages.some((m) => m.content.trim());

  function handleSave() {
    if (!hasContent) return;
    savePromptVersion(prompt.id, {
      promptContent: flattenSystemContent(draft.messages),
      model: draft.model,
      temperature: draft.temperature,
      messages: draft.messages,
      tools: draft.tools,
      outputSchema: draft.outputSchema,
    });
  }

  function updateMessage(id: string, patch: Partial<PromptMessage>) {
    editDraft({ messages: draft.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  }
  function addMessage() {
    editDraft({ messages: [...draft.messages, { id: newId("msg"), role: "human", content: "" }] });
  }
  function removeMessage(id: string) {
    if (draft.messages.length <= 1) return;
    editDraft({ messages: draft.messages.filter((m) => m.id !== id) });
  }
  function toggleCollapsed(id: string) {
    setCollapsedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addTool() {
    editDraft({ tools: [...draft.tools, emptyTool()] });
    setToolsExpanded(true);
  }
  function updateTool(id: string, patch: Partial<PromptTool>) {
    editDraft({ tools: draft.tools.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  }
  function removeTool(id: string) {
    editDraft({ tools: draft.tools.filter((t) => t.id !== id) });
  }

  function updateOutputSchema(patch: Partial<PromptOutputSchema>) {
    editDraft({ outputSchema: { ...draft.outputSchema, ...patch } });
  }

  // Variables are derived live from the messages, and their test values persist across edits to
  // other variables (only pruning/adding entries when the detected variable set actually changes).
  const variableNames = useMemo(() => extractVariableNames(draft.messages), [draft.messages]);
  useEffect(() => {
    setVariableValues((prev) => {
      const sameSet =
        variableNames.length === Object.keys(prev).length && variableNames.every((name) => name in prev);
      if (sameSet) return prev;
      const next: Record<string, string> = {};
      for (const name of variableNames) next[name] = prev[name] ?? "";
      return next;
    });
  }, [variableNames]);

  const toolsJsonValid = draft.tools.every((t) => isValidJson(t.parameters));
  const schemaJsonValid = !draft.outputSchema.enabled || isValidJson(draft.outputSchema.schema);
  const canRun = toolsJsonValid && schemaJsonValid && hasContent;

  async function handleRun() {
    setTestBusy(true);
    setTestError(null);
    setTestOutput(null);
    setTestToolCalls(null);
    try {
      const messages: PlaygroundChatMessage[] = draft.messages
        .filter((m) => m.content.trim().length > 0)
        .map((m) => ({ role: ROLE_TO_API[m.role], content: substituteVariables(m.content, variableValues) }));

      const tools = draft.tools
        .filter((t) => t.name.trim())
        .map((t) => ({
          name: t.name.trim(),
          description: t.description,
          parameters: JSON.parse(t.parameters || "{}"),
        }));

      const responseFormat =
        draft.outputSchema.enabled && draft.outputSchema.schema.trim()
          ? { name: draft.outputSchema.name || "output", schema: JSON.parse(draft.outputSchema.schema) }
          : null;

      const result = await runPlaygroundRemote({
        messages,
        model: draft.model,
        temperature: draft.temperature,
        tools: tools.length > 0 ? tools : undefined,
        responseFormat,
      });
      setTestOutput(result.content);
      setTestToolCalls(result.toolCalls ?? null);
    } catch (e) {
      setTestError(e instanceof Error ? e.message : String(e));
    } finally {
      setTestBusy(false);
    }
  }

  const prettyOutput = useMemo(() => {
    if (testOutput === null) return null;
    try {
      return JSON.stringify(JSON.parse(testOutput), null, 2);
    } catch {
      return testOutput;
    }
  }, [testOutput]);

  const sortedVersions = [...prompt.versions].reverse();

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <History size={13} />
            <select
              value={viewingVersionId}
              onChange={(e) => handleSelectVersion(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800 outline-none"
            >
              {sortedVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version} · {v.status}
                  {v.id === prompt.activeVersionId ? " (current)" : ""}
                  {isDirty && v.id === viewingVersionId ? " + unsaved edits" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2">
            {isDirty ? (
              <Badge tone="warning">Unsaved draft</Badge>
            ) : (
              viewingVersion.status === "published" && <Badge tone="success">Published</Badge>
            )}
            <select
              value={draft.model}
              onChange={(e) => editDraft({ model: e.target.value })}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800"
            >
              {MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              Temp
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={draft.temperature}
                onChange={(e) => editDraft({ temperature: Number(e.target.value) })}
                className="w-14 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800"
              />
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-500">Messages</label>
          <div className="space-y-2">
            {draft.messages.map((message) => {
              const collapsed = collapsedMessageIds.has(message.id);
              return (
                <div key={message.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <div className="flex items-center gap-1">
                    <select
                      value={message.role}
                      onChange={(e) => updateMessage(message.id, { role: e.target.value as PromptRole })}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:border-sky-500"
                    >
                      {(Object.keys(ROLE_LABEL) as PromptRole[]).map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABEL[role]}
                        </option>
                      ))}
                    </select>
                    <span className="flex-1" />
                    <FileAttachButton
                      title="Insert a text file's contents"
                      onText={(text) => updateMessage(message.id, { content: text })}
                    />
                    <button
                      type="button"
                      onClick={() => removeMessage(message.id)}
                      disabled={draft.messages.length <= 1}
                      title="Remove message"
                      className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <Trash2 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleCollapsed(message.id)}
                      title={collapsed ? "Expand" : "Collapse"}
                      className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    </button>
                  </div>
                  {!collapsed && (
                    <AutoGrowTextArea
                      value={message.content}
                      onChange={(e) => updateMessage(message.id, { content: e.target.value })}
                      placeholder={
                        message.role === "system"
                          ? "System instructions"
                          : message.role === "human"
                            ? "e.g. {input}"
                            : "Example assistant reply"
                      }
                      className="mt-1.5 font-mono text-xs leading-relaxed"
                    />
                  )}
                </div>
              );
            })}
          </div>
          <Button size="sm" onClick={addMessage}>
            <Plus size={13} /> Message
          </Button>
        </div>

        <div className="rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setToolsExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-left"
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
              <Wrench size={13} /> Tools {draft.tools.length > 0 && <Badge>{draft.tools.length}</Badge>}
            </span>
            {toolsExpanded ? (
              <ChevronDown size={14} className="text-slate-400" />
            ) : (
              <ChevronRight size={14} className="text-slate-400" />
            )}
          </button>
          {toolsExpanded && (
            <div className="space-y-2 border-t border-slate-200 p-3">
              {draft.tools.length === 0 && <p className="text-xs text-slate-400">No tools defined yet.</p>}
              {draft.tools.map((tool) => (
                <div key={tool.id} className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <div className="flex items-center gap-1.5">
                    <TextInput
                      value={tool.name}
                      onChange={(e) => updateTool(tool.id, { name: e.target.value })}
                      placeholder="tool_name"
                      className="text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removeTool(tool.id)}
                      title="Remove tool"
                      className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <TextInput
                    value={tool.description}
                    onChange={(e) => updateTool(tool.id, { description: e.target.value })}
                    placeholder="What does this tool do?"
                    className="text-xs"
                  />
                  <textarea
                    rows={4}
                    value={tool.parameters}
                    onChange={(e) => updateTool(tool.id, { parameters: e.target.value })}
                    className={`w-full resize-none rounded-lg border px-2.5 py-1.5 font-mono text-xs outline-none ${
                      isValidJson(tool.parameters)
                        ? "border-slate-200 bg-white text-slate-800 focus:border-sky-500"
                        : "border-rose-300 bg-rose-50 text-rose-800"
                    }`}
                  />
                  {!isValidJson(tool.parameters) && <p className="text-[11px] text-rose-600">Invalid JSON Schema.</p>}
                </div>
              ))}
              <Button size="sm" onClick={addTool}>
                <Plus size={13} /> Tool
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setSchemaExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-left"
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
              <Braces size={13} /> Output Schema {draft.outputSchema.enabled && <Badge tone="accent">On</Badge>}
            </span>
            {schemaExpanded ? (
              <ChevronDown size={14} className="text-slate-400" />
            ) : (
              <ChevronRight size={14} className="text-slate-400" />
            )}
          </button>
          {schemaExpanded && (
            <div className="space-y-2 border-t border-slate-200 p-3">
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.outputSchema.enabled}
                  onChange={(e) => updateOutputSchema({ enabled: e.target.checked })}
                />
                Enforce a structured JSON output
              </label>
              {draft.outputSchema.enabled && (
                <>
                  <TextInput
                    value={draft.outputSchema.name}
                    onChange={(e) => updateOutputSchema({ name: e.target.value })}
                    placeholder="schema name"
                    className="text-xs"
                  />
                  <textarea
                    rows={5}
                    value={draft.outputSchema.schema}
                    onChange={(e) => updateOutputSchema({ schema: e.target.value })}
                    className={`w-full resize-none rounded-lg border px-2.5 py-1.5 font-mono text-xs outline-none ${
                      isValidJson(draft.outputSchema.schema)
                        ? "border-slate-200 bg-white text-slate-800 focus:border-sky-500"
                        : "border-rose-300 bg-rose-50 text-rose-800"
                    }`}
                  />
                  {!isValidJson(draft.outputSchema.schema) && (
                    <p className="text-[11px] text-rose-600">Invalid JSON Schema.</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-sm text-xs text-slate-400">
            {isDirty
              ? "Edits are kept as a draft — test them freely. Nothing is versioned until you save."
              : prompt.specId
                ? "Saving mints a new version and forks the linked Spec back to draft, same as editing it there."
                : "Saving mints a new, independent version of this Prompt."}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleDiscardDraft} disabled={!isDirty}>
              <Undo2 size={13} /> Discard draft
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={!isDirty || !hasContent}>
              <Save size={13} /> Save as new version
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Try it</h3>
          {hasApiKey === false && (
            <span
              className="inline-flex items-center gap-1 text-xs text-amber-600/80"
              title="No OPENAI_API_KEY configured — using an offline simulation."
            >
              <ZapOff size={12} /> Simulated
            </span>
          )}
          {hasApiKey === true && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600/80">
              <Zap size={12} /> Live LLM
            </span>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-600">Variables</p>
          {variableNames.length === 0 ? (
            <p className="text-xs text-slate-400">
              No <code>{"{variables}"}</code> detected — add a placeholder like <code>{"{input}"}</code> to a
              message to templatize it.
            </p>
          ) : (
            <div className="space-y-2">
              {variableNames.map((name) => (
                <div key={name} className="flex items-start gap-1.5">
                  <div className="min-w-0 flex-1">
                    <label className="mb-0.5 block font-mono text-[11px] text-sky-700">{`{${name}}`}</label>
                    <AutoGrowTextArea
                      value={variableValues[name] ?? ""}
                      onChange={(e) => setVariableValues((v) => ({ ...v, [name]: e.target.value }))}
                      minHeight={36}
                      className="text-xs"
                    />
                  </div>
                  <div className="pt-4">
                    <FileAttachButton
                      title="Fill from a text file"
                      onText={(text) => setVariableValues((v) => ({ ...v, [name]: text }))}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Button variant="secondary" size="sm" onClick={handleRun} disabled={testBusy || !canRun}>
          {testBusy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          {testBusy ? "Running" : "Run"}
        </Button>
        {(!toolsJsonValid || !schemaJsonValid) && (
          <p className="text-xs text-rose-600">Fix the invalid JSON above before running.</p>
        )}
        {testError && <p className="text-xs text-rose-600">{testError}</p>}

        {testToolCalls && testToolCalls.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Tool calls</p>
            {testToolCalls.map((call, i) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                <Badge tone="accent">{call.name}</Badge>
                <pre className="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-slate-700">
                  {call.arguments}
                </pre>
              </div>
            ))}
            <p className="text-[11px] text-slate-400">
              Tool calls are shown for review — this Playground doesn't execute tools.
            </p>
          </div>
        )}

        {testOutput !== null && (
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Output</p>
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-100 p-3 font-mono text-xs text-slate-800">
              {prettyOutput}
            </pre>
          </div>
        )}

        {prompt.specId && (
          <p className="text-[11px] text-slate-400">
            This is an ad-hoc single test — to run the full Eval suite for this Spec, use Run in the Spec's Workspace.
          </p>
        )}
      </div>
    </div>
  );
}
