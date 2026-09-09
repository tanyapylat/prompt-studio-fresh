import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Braces,
  ChevronDown,
  ChevronRight,
  Clock3,
  Code2,
  DollarSign,
  History,
  Loader2,
  Maximize2,
  Paperclip,
  Play,
  Plus,
  Save,
  Settings2,
  Trash2,
  Undo2,
  Wrench,
} from "lucide-react";
import { useStore } from "../../store";
import { activePromptVersion } from "../../promptFactory";
import {
  runPlaygroundRemote,
  type PlaygroundChatMessage,
  type PlaygroundSettings as PlaygroundSettingsRequest,
  type PlaygroundToolCall,
  type PlaygroundUsage,
} from "../../api";
import {
  ROLE_TO_API,
  defaultMessages,
  defaultOutputSchema,
  defaultPromptSettings,
  emptyTool,
  extractVariableNames,
  flattenSystemContent,
  substituteVariables,
} from "../../promptTemplate";
import type {
  Prompt,
  PromptDraft,
  PromptMessage,
  PromptOutputSchema,
  PromptRole,
  PromptSettings,
  PromptTool,
} from "../../types";
import { newId } from "../../utils/id";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RawPromptModal } from "./RawPromptModal";

export const MODELS = ["gpt-4o-mini", "gpt-4o", "claude-3-7-sonnet", "gemini-1.5-pro"];

const ROLE_LABEL: Record<PromptRole, string> = { system: "System", human: "Human", ai: "AI" };

/** How long editing pauses before the working copy is persisted onto the Prompt. */
const DRAFT_PERSIST_MS = 400;

interface Draft {
  messages: PromptMessage[];
  model: string;
  temperature: number;
  tools: PromptTool[];
  outputSchema: PromptOutputSchema;
  settings: PromptSettings;
}

interface VersionLike {
  promptContent: string;
  model: string;
  temperature: number;
  messages?: PromptMessage[];
  tools?: PromptTool[];
  outputSchema?: PromptOutputSchema;
  settings?: PromptSettings;
}

function draftFromVersion(v: VersionLike): Draft {
  return {
    messages: v.messages ?? defaultMessages(v.promptContent),
    model: v.model,
    temperature: v.temperature,
    tools: v.tools ?? [],
    outputSchema: v.outputSchema ?? defaultOutputSchema(),
    settings: v.settings ?? defaultPromptSettings(),
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

function sameStringArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function sameSettings(a: PromptSettings, b: PromptSettings): boolean {
  return (
    a.maxTokens === b.maxTokens &&
    a.topP === b.topP &&
    a.frequencyPenalty === b.frequencyPenalty &&
    a.presencePenalty === b.presencePenalty &&
    a.seed === b.seed &&
    a.timeoutMs === b.timeoutMs &&
    (a.logitBias ?? "") === (b.logitBias ?? "") &&
    sameStringArray(a.stopSequences ?? [], b.stopSequences ?? [])
  );
}

/** Structural comparison (ignoring message/tool ids), since the draft can add/remove/reorder rows. */
function sameContent(a: Draft, b: VersionLike): boolean {
  const other = draftFromVersion(b);
  return (
    a.model === other.model &&
    a.temperature === other.temperature &&
    sameMessages(a.messages, other.messages) &&
    sameTools(a.tools, other.tools) &&
    sameOutputSchema(a.outputSchema, other.outputSchema) &&
    sameSettings(a.settings, other.settings)
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
  const [collapsedMessageIds, setCollapsedMessageIds] = useState<Set<string>>(() => new Set());
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [schemaExpanded, setSchemaExpanded] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [testBusy, setTestBusy] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [testToolCalls, setTestToolCalls] = useState<PlaygroundToolCall[] | null>(null);
  const [testUsage, setTestUsage] = useState<PlaygroundUsage | null>(null);
  const [testLatencyMs, setTestLatencyMs] = useState<number | null>(null);
  const [testCostUsd, setTestCostUsd] = useState<number | null>(null);

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
    setTestUsage(null);
    setTestLatencyMs(null);
    setTestCostUsd(null);
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
        settings: draft.settings,
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
      settings: draft.settings,
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
  /** Swaps the message at `id` with its neighbor one slot toward `direction` — a no-op at either end. */
  function moveMessage(id: string, direction: -1 | 1) {
    const index = draft.messages.findIndex((m) => m.id === id);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= draft.messages.length) return;
    const next = [...draft.messages];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    editDraft({ messages: next });
  }
  function toggleCollapsed(id: string) {
    setCollapsedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function collapseAllMessages() {
    setCollapsedMessageIds(new Set(draft.messages.map((m) => m.id)));
  }
  function expandAllMessages() {
    setCollapsedMessageIds(new Set());
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

  function updateSettings(patch: Partial<PromptSettings>) {
    editDraft({ settings: { ...draft.settings, ...patch } });
  }
  /** Number inputs round-trip through text, so an empty box means "unset" rather than 0. */
  function numberOrUndefined(raw: string): number | undefined {
    if (raw.trim() === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
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
  const logitBiasJsonValid = !draft.settings.logitBias?.trim() || isValidJson(draft.settings.logitBias);
  const canRun = toolsJsonValid && schemaJsonValid && logitBiasJsonValid && hasContent;

  async function handleRun() {
    setTestBusy(true);
    setTestError(null);
    setTestOutput(null);
    setTestToolCalls(null);
    setTestUsage(null);
    setTestLatencyMs(null);
    setTestCostUsd(null);
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

      const s = draft.settings;
      const settings: PlaygroundSettingsRequest = {
        maxTokens: s.maxTokens,
        topP: s.topP,
        frequencyPenalty: s.frequencyPenalty,
        presencePenalty: s.presencePenalty,
        seed: s.seed,
        stopSequences: s.stopSequences && s.stopSequences.length > 0 ? s.stopSequences : undefined,
        logitBias: s.logitBias?.trim() ? JSON.parse(s.logitBias) : undefined,
        timeoutMs: s.timeoutMs,
      };

      const result = await runPlaygroundRemote({
        messages,
        model: draft.model,
        temperature: draft.temperature,
        tools: tools.length > 0 ? tools : undefined,
        responseFormat,
        settings,
      });
      setTestOutput(result.content);
      setTestToolCalls(result.toolCalls ?? null);
      setTestUsage(result.usage);
      setTestLatencyMs(result.latencyMs);
      setTestCostUsd(result.costUsd);
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
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
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
            <Button size="sm" onClick={() => setShowRaw(true)} title="View the raw prompt text and request JSON">
              <Code2 size={13} /> Raw
            </Button>
          </div>
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
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-500">Messages</label>
            {draft.messages.length > 1 && (
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <button type="button" onClick={expandAllMessages} className="hover:text-slate-700">
                  Expand all
                </button>
                <span>·</span>
                <button type="button" onClick={collapseAllMessages} className="hover:text-slate-700">
                  Collapse all
                </button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            {draft.messages.map((message, index) => {
              const collapsed = collapsedMessageIds.has(message.id);
              return (
                <div key={message.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <div className="flex items-center gap-1">
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        onClick={() => moveMessage(message.id, -1)}
                        disabled={index === 0}
                        title="Move up"
                        className="rounded-sm p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-20"
                      >
                        <ArrowUp size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveMessage(message.id, 1)}
                        disabled={index === draft.messages.length - 1}
                        title="Move down"
                        className="rounded-sm p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-20"
                      >
                        <ArrowDown size={11} />
                      </button>
                    </div>
                    <select
                      value={message.role}
                      onChange={(e) => updateMessage(message.id, { role: e.target.value as PromptRole })}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:border-ring"
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
                      onClick={() => setExpandedMessageId(message.id)}
                      title="Expand to full screen — handy for long messages"
                      className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Maximize2 size={13} />
                    </button>
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
                    <AutoGrowTextarea
                      value={message.content}
                      onChange={(e) => updateMessage(message.id, { content: e.target.value })}
                      placeholder={
                        message.role === "system"
                          ? "System instructions"
                          : message.role === "human"
                            ? "e.g. {input}"
                            : "Example assistant reply"
                      }
                      minHeight={58}
                      maxHeight={420}
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

        {expandedMessageId &&
          (() => {
            const message = draft.messages.find((m) => m.id === expandedMessageId);
            if (!message) return null;
            return (
              <Dialog open onOpenChange={(open) => !open && setExpandedMessageId(null)}>
                <DialogContent width="lg">
                  <DialogHeader>
                    <DialogTitle>{`Edit ${ROLE_LABEL[message.role]} message`}</DialogTitle>
                  </DialogHeader>
                  <DialogBody>
                    <textarea
                      autoFocus
                      value={message.content}
                      onChange={(e) => updateMessage(message.id, { content: e.target.value })}
                      placeholder={
                        message.role === "system"
                          ? "System instructions"
                          : message.role === "human"
                            ? "e.g. {input}"
                            : "Example assistant reply"
                      }
                      className="h-[60vh] w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs leading-relaxed text-slate-900 outline-none focus:border-ring"
                    />
                  </DialogBody>
                </DialogContent>
              </Dialog>
            );
          })()}

        {showRaw && (
          <RawPromptModal
            source={draft}
            title={`Raw prompt — v${viewingVersion.version}${isDirty ? " + unsaved edits" : ""}`}
            onClose={() => setShowRaw(false)}
          />
        )}

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
                    <Input
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
                  <Input
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
                        ? "border-slate-200 bg-white text-slate-800 focus:border-ring"
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
                  <Input
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
                        ? "border-slate-200 bg-white text-slate-800 focus:border-ring"
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

        <div className="rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setSettingsExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-left"
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
              <Settings2 size={13} /> Advanced settings
            </span>
            {settingsExpanded ? (
              <ChevronDown size={14} className="text-slate-400" />
            ) : (
              <ChevronRight size={14} className="text-slate-400" />
            )}
          </button>
          {settingsExpanded && (
            <div className="space-y-3 border-t border-slate-200 p-3">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <label className="text-[11px] text-slate-500">
                  Max tokens
                  <input
                    type="number"
                    min={1}
                    value={draft.settings.maxTokens ?? ""}
                    onChange={(e) => updateSettings({ maxTokens: numberOrUndefined(e.target.value) })}
                    placeholder="model default"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800 outline-none focus:border-ring"
                  />
                </label>
                <label className="text-[11px] text-slate-500">
                  Top P
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={draft.settings.topP ?? ""}
                    onChange={(e) => updateSettings({ topP: numberOrUndefined(e.target.value) })}
                    placeholder="1"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800 outline-none focus:border-ring"
                  />
                </label>
                <label className="text-[11px] text-slate-500">
                  Seed
                  <input
                    type="number"
                    value={draft.settings.seed ?? ""}
                    onChange={(e) => updateSettings({ seed: numberOrUndefined(e.target.value) })}
                    placeholder="random"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800 outline-none focus:border-ring"
                  />
                </label>
                <label className="text-[11px] text-slate-500">
                  Frequency penalty
                  <input
                    type="number"
                    min={-2}
                    max={2}
                    step={0.1}
                    value={draft.settings.frequencyPenalty ?? ""}
                    onChange={(e) => updateSettings({ frequencyPenalty: numberOrUndefined(e.target.value) })}
                    placeholder="0"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800 outline-none focus:border-ring"
                  />
                </label>
                <label className="text-[11px] text-slate-500">
                  Presence penalty
                  <input
                    type="number"
                    min={-2}
                    max={2}
                    step={0.1}
                    value={draft.settings.presencePenalty ?? ""}
                    onChange={(e) => updateSettings({ presencePenalty: numberOrUndefined(e.target.value) })}
                    placeholder="0"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800 outline-none focus:border-ring"
                  />
                </label>
                <label className="text-[11px] text-slate-500">
                  Timeout (ms)
                  <input
                    type="number"
                    min={0}
                    value={draft.settings.timeoutMs ?? ""}
                    onChange={(e) => updateSettings({ timeoutMs: numberOrUndefined(e.target.value) })}
                    placeholder="none"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800 outline-none focus:border-ring"
                  />
                </label>
              </div>
              <label className="block text-[11px] text-slate-500">
                Stop sequences (comma-separated)
                <Input
                  value={(draft.settings.stopSequences ?? []).join(", ")}
                  onChange={(e) =>
                    updateSettings({
                      stopSequences: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="e.g. \\n\\n, END"
                  className="mt-1 text-xs"
                />
              </label>
              <label className="block text-[11px] text-slate-500">
                Logit bias — token id → bias (JSON)
                <textarea
                  rows={3}
                  value={draft.settings.logitBias ?? ""}
                  onChange={(e) => updateSettings({ logitBias: e.target.value })}
                  placeholder={'{"50256": -100}'}
                  className={`mt-1 w-full resize-none rounded-lg border px-2.5 py-1.5 font-mono text-xs outline-none ${
                    logitBiasJsonValid
                      ? "border-slate-200 bg-white text-slate-800 focus:border-ring"
                      : "border-rose-300 bg-rose-50 text-rose-800"
                  }`}
                />
              </label>
              {!logitBiasJsonValid && <p className="text-[11px] text-rose-600">Invalid JSON.</p>}
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
            <Button variant="default" size="sm" onClick={handleSave} disabled={!isDirty || !hasContent}>
              <Save size={13} /> Save as new version
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Try it</h3>
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
                    <label className="mb-0.5 block font-mono text-[11px] text-primary">{`{${name}}`}</label>
                    <AutoGrowTextarea
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
        {(!toolsJsonValid || !schemaJsonValid || !logitBiasJsonValid) && (
          <p className="text-xs text-rose-600">Fix the invalid JSON above before running.</p>
        )}
        {testError && <p className="text-xs text-rose-600">{testError}</p>}

        {testUsage && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            <span className="flex items-center gap-1" title="Estimated cost of this run">
              <DollarSign size={12} className="text-slate-400" />
              {testCostUsd !== null && testCostUsd < 0.01 ? `$${testCostUsd.toFixed(4)}` : `$${(testCostUsd ?? 0).toFixed(2)}`}
            </span>
            <span className="flex items-center gap-1" title="Round-trip latency">
              <Clock3 size={12} className="text-slate-400" />
              {testLatencyMs !== null ? `${testLatencyMs.toLocaleString()} ms` : "—"}
            </span>
            <span title="Prompt tokens in / completion tokens out">
              {testUsage.totalTokens.toLocaleString()} tokens ({testUsage.promptTokens} in / {testUsage.completionTokens}{" "}
              out)
            </span>
          </div>
        )}

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
            This is an ad-hoc single test — to run the full Eval suite against the Dataset, see below.
          </p>
        )}
      </div>
    </div>
  );
}
