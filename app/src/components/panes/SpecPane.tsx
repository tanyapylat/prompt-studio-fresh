import { useState } from "react";
import { AlertCircle, CheckCircle2, CircleDashed, HelpCircle, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { useStore } from "../../store";
import type { IOField, IOFieldType, OutputMode, Requirement, SpecProject } from "../../types";
import {
  markBriefEdited,
  newExample,
  newIOField,
  newOpenQuestion,
  newRequirement,
  OUTPUT_MODES,
} from "../../specFactory";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const IO_FIELD_TYPES: IOFieldType[] = ["string", "number", "boolean", "object", "array"];

export function SpecPane({ spec }: { spec: SpecProject }) {
  const { updateSpec } = useStore();

  // Goal/context/I-O contracts/requirements/examples are the "brief" that Generate turns into the
  // Prompt/Assertions/Dataset — edits here can make those artifacts stale (see Workspace's banner).
  function patchBrief(fn: (s: SpecProject) => SpecProject) {
    updateSpec(spec.id, (s) => markBriefEdited({ ...fn(s), updatedAt: Date.now() }));
  }

  function isCovered(requirementId: string) {
    return spec.assertions.some((a) => a.sourceRequirementId === requirementId);
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs font-medium text-slate-500">Goal</label>
        <AutoGrowTextarea
          value={spec.goal}
          placeholder="What is this prompt for, and who reads the output?"
          onChange={(e) => patchBrief((s) => ({ ...s, goal: e.target.value }))}
          className="mt-1"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500">Context</label>
        <AutoGrowTextarea
          value={spec.context}
          placeholder="Background beyond the goal — where this is used downstream, who else is involved, constraints that shaped it…"
          onChange={(e) => patchBrief((s) => ({ ...s, context: e.target.value }))}
          className="mt-1"
        />
      </div>

      <IOFieldSection
        title="Input contract"
        fields={spec.inputFields}
        onAdd={() => patchBrief((s) => ({ ...s, inputFields: [...s.inputFields, newIOField()] }))}
        onUpdate={(id, patchField) =>
          patchBrief((s) => ({
            ...s,
            inputFields: s.inputFields.map((f) => (f.id === id ? { ...f, ...patchField } : f)),
          }))
        }
        onRemove={(id) => patchBrief((s) => ({ ...s, inputFields: s.inputFields.filter((f) => f.id !== id) }))}
      />

      <OutputContractSection spec={spec} patchBrief={patchBrief} />

      <RequirementList
        spec={spec}
        isCovered={isCovered}
        onAdd={(statement) => patchBrief((s) => ({ ...s, requirements: [...s.requirements, newRequirement(statement)] }))}
        onRemove={(id) => patchBrief((s) => ({ ...s, requirements: s.requirements.filter((r) => r.id !== id) }))}
        onEdit={(id, patchReq) =>
          patchBrief((s) => ({
            ...s,
            requirements: s.requirements.map((r) => (r.id === id ? { ...r, ...patchReq } : r)),
          }))
        }
      />

      <ExampleList
        spec={spec}
        onAdd={(input) => patchBrief((s) => ({ ...s, examples: [...s.examples, newExample(input)] }))}
        onRemove={(id) => patchBrief((s) => ({ ...s, examples: s.examples.filter((e) => e.id !== id) }))}
        onEdit={(id, patchEx) =>
          patchBrief((s) => ({
            ...s,
            examples: s.examples.map((e) => (e.id === id ? { ...e, ...patchEx } : e)),
          }))
        }
      />

      <OpenQuestionsSection spec={spec} patchBrief={patchBrief} />
    </div>
  );
}

function SectionHeader({
  title,
  onAdd,
  addTitle,
}: {
  title: string;
  onAdd: () => void;
  addTitle: string;
}) {
  return (
    <div className="mb-1.5 flex items-center justify-between">
      <label className="text-xs font-medium text-slate-500">{title}</label>
      <Button variant="ghost" size="icon" title={addTitle} onClick={onAdd}>
        <Plus size={14} />
      </Button>
    </div>
  );
}

/**
 * Replaces `window.prompt()` for every "+" quick-add in this pane — an unstyled native browser
 * dialog that looks broken next to everything else here. Appears in place, at the bottom of the
 * list it's adding to (matching where the new item will actually land), and always uses the same
 * grow-as-you-type textarea as every other text field in this pane.
 */
function InlineAddRow({
  placeholder,
  submitLabel = "Add",
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  submitLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");

  function commit() {
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-2">
      <AutoGrowTextarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        minHeight={36}
        maxHeight={160}
        className="border-slate-200 bg-white"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            commit();
          }
        }}
      />
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] text-slate-400">Enter to add · Shift+Enter for a new line · Esc to cancel</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="xs" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="xs" onClick={commit} disabled={!value.trim()}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function IOFieldRow({
  field,
  onUpdate,
  onRemove,
}: {
  field: IOField;
  onUpdate: (patch: Partial<IOField>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="group rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <Input
          value={field.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="fieldName"
          className="h-7 flex-1 font-mono text-xs"
        />
        <select
          value={field.type}
          onChange={(e) => onUpdate({ type: e.target.value as IOFieldType })}
          className="h-7 shrink-0 rounded-lg border border-slate-200 bg-white px-1.5 text-xs text-slate-700 outline-none focus:border-ring"
        >
          {IO_FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label
          className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-slate-500"
          title="Checked = the caller must always provide this field. Unchecked = optional, may be omitted."
        >
          <input type="checkbox" checked={field.required} onChange={(e) => onUpdate({ required: e.target.checked })} />
          Required
        </label>
        <button onClick={onRemove} className="shrink-0 text-slate-400 opacity-0 hover:text-rose-600 group-hover:opacity-100">
          <Trash2 size={13} />
        </button>
      </div>
      <AutoGrowTextarea
        value={field.description}
        onChange={(e) => onUpdate({ description: e.target.value })}
        placeholder="What this field is / how to use it"
        minHeight={16}
        maxHeight={96}
        collapsedMaxHeight={32}
        className="mt-1 border-0 bg-transparent p-0 text-xs leading-4 text-slate-700 transition-none focus-visible:border-0 focus-visible:ring-0"
      />
    </div>
  );
}

function IOFieldSection({
  title,
  fields,
  onAdd,
  onUpdate,
  onRemove,
}: {
  title: string;
  fields: IOField[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<IOField>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div>
      <SectionHeader title={title} onAdd={onAdd} addTitle="Add field" />
      <div className="space-y-1.5">
        {fields.length === 0 && <p className="text-xs text-slate-400">No fields defined yet.</p>}
        {fields.map((f) => (
          <IOFieldRow key={f.id} field={f} onUpdate={(patch) => onUpdate(f.id, patch)} onRemove={() => onRemove(f.id)} />
        ))}
      </div>
    </div>
  );
}

function OutputContractSection({
  spec,
  patchBrief,
}: {
  spec: SpecProject;
  patchBrief: (fn: (s: SpecProject) => SpecProject) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-slate-500">Output contract</label>
        <div className="flex items-center gap-1.5">
          <select
            value={spec.outputMode}
            onChange={(e) => patchBrief((s) => ({ ...s, outputMode: e.target.value as OutputMode }))}
            className="h-6 rounded-lg border border-slate-200 bg-white px-1.5 text-[11px] text-slate-700 outline-none focus:border-ring"
            title="How the output is actually delivered"
          >
            {OUTPUT_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="icon"
            title="Add field"
            onClick={() => patchBrief((s) => ({ ...s, outputFields: [...s.outputFields, newIOField()] }))}
          >
            <Plus size={14} />
          </Button>
        </div>
      </div>
      {spec.outputMode === "tool_call" && (
        <Input
          value={spec.outputToolName ?? ""}
          onChange={(e) => patchBrief((s) => ({ ...s, outputToolName: e.target.value }))}
          placeholder="Tool/function name (e.g. your_func_1)"
          className="mb-1.5 h-7 font-mono text-xs"
        />
      )}
      <div className="space-y-1.5">
        {spec.outputFields.length === 0 && (
          <p className="text-xs text-slate-400">
            {spec.outputMode === "text" ? "No fields yet — optional for plain text; add one to describe the single value." : "No fields defined yet."}
          </p>
        )}
        {spec.outputFields.map((f) => (
          <IOFieldRow
            key={f.id}
            field={f}
            onUpdate={(patch) =>
              patchBrief((s) => ({
                ...s,
                outputFields: s.outputFields.map((x) => (x.id === f.id ? { ...x, ...patch } : x)),
              }))
            }
            onRemove={() => patchBrief((s) => ({ ...s, outputFields: s.outputFields.filter((x) => x.id !== f.id) }))}
          />
        ))}
      </div>
    </div>
  );
}

function RequirementList({
  spec,
  isCovered,
  onAdd,
  onRemove,
  onEdit,
}: {
  spec: SpecProject;
  isCovered: (id: string) => boolean;
  onAdd: (statement: string) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string, patch: Partial<Requirement>) => void;
}) {
  const items = spec.requirements;
  const [adding, setAdding] = useState(false);
  return (
    <div>
      <SectionHeader title="Requirements" addTitle="Add requirement" onAdd={() => setAdding(true)} />
      <div className="space-y-1.5">
        {items.length === 0 && !adding && <p className="text-xs text-slate-400">None yet.</p>}
        {items.map((item) => {
          const covered = isCovered(item.id);
          return (
            <div
              key={item.id}
              className="group flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"
            >
              {covered ? (
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" aria-label="Covered by an assertion" />
              ) : (
                <AlertCircle size={14} className="mt-0.5 shrink-0 text-amber-600" aria-label="No covering assertion yet" />
              )}
              <div className="min-w-0 flex-1">
                <input
                  value={item.name}
                  onChange={(e) => onEdit(item.id, { name: e.target.value })}
                  className="mb-0.5 w-full bg-transparent text-[10px] font-semibold uppercase tracking-wide text-slate-500 outline-none focus:text-slate-700"
                />
                <AutoGrowTextarea
                  value={item.statement}
                  onChange={(e) => onEdit(item.id, { statement: e.target.value })}
                  minHeight={16}
                  maxHeight={144}
                  collapsedMaxHeight={32}
                  className="border-0 bg-transparent p-0 text-xs leading-4 text-slate-800 transition-none focus-visible:border-0 focus-visible:ring-0"
                />
              </div>
              <button
                onClick={() => onRemove(item.id)}
                className="shrink-0 text-slate-400 opacity-0 hover:text-rose-600 group-hover:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
        {adding && (
          <InlineAddRow
            placeholder="Something the output must always or must never do…"
            onSubmit={(text) => {
              onAdd(text);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>
    </div>
  );
}

function ExampleList({
  spec,
  onAdd,
  onRemove,
  onEdit,
}: {
  spec: SpecProject;
  onAdd: (input: string) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string, patch: { input?: string; expectedOutput?: string; comment?: string }) => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div>
      <SectionHeader title="Examples / edge cases" addTitle="Add example" onAdd={() => setAdding(true)} />
      <div className="space-y-2">
        {spec.examples.length === 0 && !adding && <p className="text-xs text-slate-400">None yet.</p>}
        {spec.examples.map((ex) => (
          <div
            key={ex.id}
            className="group space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Input</span>
                <AutoGrowTextarea
                  value={ex.input}
                  onChange={(e) => onEdit(ex.id, { input: e.target.value })}
                  minHeight={16}
                  maxHeight={144}
                  collapsedMaxHeight={32}
                  className="border-0 bg-transparent p-0 text-xs leading-4 text-slate-800 transition-none focus-visible:border-0 focus-visible:ring-0"
                />
              </div>
              <button
                onClick={() => onRemove(ex.id)}
                className="shrink-0 text-slate-400 opacity-0 hover:text-rose-600 group-hover:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Expected output</span>
              <AutoGrowTextarea
                value={ex.expectedOutput ?? ""}
                placeholder="What should the output be for this input?"
                onChange={(e) => onEdit(ex.id, { expectedOutput: e.target.value })}
                minHeight={16}
                maxHeight={96}
                collapsedMaxHeight={32}
                className="border-0 bg-transparent p-0 text-xs leading-4 text-slate-800 transition-none focus-visible:border-0 focus-visible:ring-0"
              />
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Comment / rationale</span>
              <AutoGrowTextarea
                value={ex.comment ?? ""}
                placeholder="Why this example is here — what it's illustrating"
                onChange={(e) => onEdit(ex.id, { comment: e.target.value })}
                minHeight={16}
                maxHeight={96}
                collapsedMaxHeight={32}
                className="border-0 bg-transparent p-0 text-xs italic leading-4 text-slate-500 transition-none focus-visible:border-0 focus-visible:ring-0"
              />
            </div>
          </div>
        ))}
        {adding && (
          <InlineAddRow
            placeholder="Example input…"
            onSubmit={(text) => {
              onAdd(text);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>
    </div>
  );
}

function OpenQuestionsSection({
  spec,
  patchBrief,
}: {
  spec: SpecProject;
  patchBrief: (fn: (s: SpecProject) => SpecProject) => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div>
      <SectionHeader title="Open questions" addTitle="Add open question" onAdd={() => setAdding(true)} />
      <p className="mb-1.5 flex items-start gap-1 text-[11px] text-slate-400">
        <HelpCircle size={12} className="mt-0.5 shrink-0" />
        Things about this Spec that aren't decided yet — a known ambiguity, a tradeoff you haven't picked a
        side on, a gap you noticed while writing it. Flagging them here means North Star and reviewers see
        them too, instead of silently guessing an answer.
      </p>
      <div className="space-y-1.5">
        {spec.openQuestions.length === 0 && !adding && <p className="text-xs text-slate-400">Nothing flagged yet.</p>}
        {spec.openQuestions.map((q) => (
          <div
            key={q.id}
            className={clsx(
              "group flex items-start gap-2 rounded-lg border px-2.5 py-2",
              q.resolved ? "border-slate-200 bg-slate-50" : "border-amber-200 bg-amber-50",
            )}
          >
            <button
              onClick={() =>
                patchBrief((s) => ({
                  ...s,
                  openQuestions: s.openQuestions.map((x) => (x.id === q.id ? { ...x, resolved: !x.resolved } : x)),
                }))
              }
              title={q.resolved ? "Mark unresolved" : "Mark resolved"}
              className="mt-0.5 shrink-0"
            >
              {q.resolved ? (
                <CheckCircle2 size={14} className="text-emerald-600" />
              ) : (
                <CircleDashed size={14} className="text-amber-600" />
              )}
            </button>
            <AutoGrowTextarea
              value={q.text}
              onChange={(e) =>
                patchBrief((s) => ({
                  ...s,
                  openQuestions: s.openQuestions.map((x) => (x.id === q.id ? { ...x, text: e.target.value } : x)),
                }))
              }
              minHeight={16}
              maxHeight={144}
              collapsedMaxHeight={32}
              className={clsx(
                "min-w-0 flex-1 border-0 bg-transparent p-0 text-xs leading-4 transition-none focus-visible:border-0 focus-visible:ring-0",
                q.resolved ? "text-slate-500 line-through" : "text-slate-800",
              )}
            />
            <button
              onClick={() => patchBrief((s) => ({ ...s, openQuestions: s.openQuestions.filter((x) => x.id !== q.id) }))}
              className="shrink-0 text-slate-400 opacity-0 hover:text-rose-600 group-hover:opacity-100"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {adding && (
          <InlineAddRow
            placeholder="What's unresolved about this Spec?"
            onSubmit={(text) => {
              patchBrief((s) => ({ ...s, openQuestions: [...s.openQuestions, newOpenQuestion(text)] }));
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>
    </div>
  );
}
