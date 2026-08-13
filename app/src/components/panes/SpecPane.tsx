import { useState } from "react";
import { AlertCircle, Check, CheckCircle2, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { useStore } from "../../store";
import type { Criterion, PowerTag, SpecProject } from "../../types";
import { newCriterion, newExample, newPowerTag, suggestPowerTags } from "../../specFactory";
import { AutoGrowTextArea, IconButton } from "../ui";

export function SpecPane({ spec }: { spec: SpecProject }) {
  const { updateSpec } = useStore();

  function patch(fn: (s: SpecProject) => SpecProject) {
    updateSpec(spec.id, (s) => ({ ...fn(s), updatedAt: Date.now() }));
  }

  function isCovered(criterionId: string) {
    return spec.assertions.some((a) => a.sourceCriterionId === criterionId);
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs font-medium text-slate-500">Goal</label>
        <AutoGrowTextArea
          value={spec.goal}
          placeholder="What is this prompt for, and who reads the output?"
          onChange={(e) => patch((s) => ({ ...s, goal: e.target.value }))}
          className="mt-1"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500">Input contract</label>
        <AutoGrowTextArea
          value={spec.inputContract}
          placeholder="What variables/inputs does the prompt receive?"
          onChange={(e) => patch((s) => ({ ...s, inputContract: e.target.value }))}
          className="mt-1"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500">Output contract</label>
        <AutoGrowTextArea
          value={spec.outputContract}
          placeholder="What shape should the output be?"
          onChange={(e) => patch((s) => ({ ...s, outputContract: e.target.value }))}
          className="mt-1"
        />
      </div>

      <PowersSection spec={spec} patch={patch} />

      <CriterionList
        title="Guardrails"
        items={spec.guardrails}
        isCovered={isCovered}
        onAdd={(text) =>
          patch((s) => ({ ...s, guardrails: [...s.guardrails, newCriterion(text, "guardrail")] }))
        }
        onRemove={(id) => patch((s) => ({ ...s, guardrails: s.guardrails.filter((g) => g.id !== id) }))}
        onEdit={(id, text) =>
          patch((s) => ({
            ...s,
            guardrails: s.guardrails.map((g) => (g.id === id ? { ...g, text } : g)),
          }))
        }
      />

      <CriterionList
        title="Success criteria"
        items={spec.criteria}
        isCovered={isCovered}
        onAdd={(text) => patch((s) => ({ ...s, criteria: [...s.criteria, newCriterion(text)] }))}
        onRemove={(id) => patch((s) => ({ ...s, criteria: s.criteria.filter((c) => c.id !== id) }))}
        onEdit={(id, text) =>
          patch((s) => ({
            ...s,
            criteria: s.criteria.map((c) => (c.id === id ? { ...c, text } : c)),
          }))
        }
      />

      <ExampleList
        spec={spec}
        onAdd={(input) => patch((s) => ({ ...s, examples: [...s.examples, newExample(input)] }))}
        onRemove={(id) => patch((s) => ({ ...s, examples: s.examples.filter((e) => e.id !== id) }))}
      />
    </div>
  );
}

function PowersSection({
  spec,
  patch,
}: {
  spec: SpecProject;
  patch: (fn: (s: SpecProject) => SpecProject) => void;
}) {
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSuggest() {
    setSuggesting(true);
    setError(null);
    try {
      const suggestions = await suggestPowerTags(spec);
      patch((s) => {
        const existing = new Set(s.powers.map((p) => p.text.toLowerCase()));
        const fresh = suggestions.filter((sg) => !existing.has(sg.text.toLowerCase()));
        return { ...s, powers: [...s.powers, ...fresh] };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggesting(false);
    }
  }

  function addManual() {
    const text = window.prompt("What product or feature does this Spec power? (e.g. Chatbot Conversation Module)");
    if (text?.trim()) patch((s) => ({ ...s, powers: [...s.powers, newPowerTag(text.trim(), "manual")] }));
  }

  function confirmTag(id: string) {
    patch((s) => ({ ...s, powers: s.powers.map((p) => (p.id === id ? { ...p, confirmed: true } : p)) }));
  }

  function removeTag(id: string) {
    patch((s) => ({ ...s, powers: s.powers.filter((p) => p.id !== id) }));
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-medium text-slate-500">Powers (product / feature)</label>
        <div className="flex items-center gap-1">
          <IconButton title="AI-suggest from Goal & Output contract" onClick={handleSuggest}>
            {suggesting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          </IconButton>
          <IconButton title="Add tag by hand" onClick={addManual}>
            <Plus size={14} />
          </IconButton>
        </div>
      </div>
      {error && <p className="mb-1.5 text-xs text-rose-600">{error}</p>}
      {spec.powers.length === 0 ? (
        <p className="text-xs text-slate-400">Not linked to a product area yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {spec.powers.map((p: PowerTag) => (
            <span
              key={p.id}
              className={clsx(
                "group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                p.confirmed
                  ? "border-slate-300 bg-slate-100 text-slate-700"
                  : "border-amber-300 bg-amber-50 text-amber-700",
              )}
              title={p.confirmed ? undefined : "AI-suggested — pending your review"}
            >
              {p.text}
              {!p.confirmed && (
                <button onClick={() => confirmTag(p.id)} title="Accept suggestion" className="hover:text-amber-900">
                  <Check size={10} />
                </button>
              )}
              <button
                onClick={() => removeTag(p.id)}
                title="Remove"
                className="opacity-60 hover:text-rose-600 group-hover:opacity-100"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CriterionList({
  title,
  items,
  isCovered,
  onAdd,
  onRemove,
  onEdit,
}: {
  title: string;
  items: Criterion[];
  isCovered: (id: string) => boolean;
  onAdd: (text: string) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string, text: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-medium text-slate-500">{title}</label>
        <IconButton
          title={`Add ${title.toLowerCase()}`}
          onClick={() => {
            const text = window.prompt(`New ${title.slice(0, -1).toLowerCase()}`);
            if (text?.trim()) onAdd(text.trim());
          }}
        >
          <Plus size={14} />
        </IconButton>
      </div>
      <div className="space-y-1.5">
        {items.length === 0 && <p className="text-xs text-slate-400">None yet.</p>}
        {items.map((item) => {
          const covered = isCovered(item.id);
          return (
            <div
              key={item.id}
              className="group flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"
            >
              {covered ? (
                <CheckCircle2
                  size={14}
                  className="mt-0.5 shrink-0 text-emerald-600"
                  aria-label="Covered by an assertion"
                />
              ) : (
                <AlertCircle
                  size={14}
                  className="mt-0.5 shrink-0 text-amber-600"
                  aria-label="No covering assertion yet"
                />
              )}
              <AutoGrowTextArea
                value={item.text}
                onChange={(e) => onEdit(item.id, e.target.value)}
                minHeight={16}
                maxHeight={144}
                collapsedMaxHeight={32}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs leading-4 text-slate-800 transition-none focus:border-0"
              />
              <button
                onClick={() => onRemove(item.id)}
                className="shrink-0 text-slate-400 opacity-0 hover:text-rose-600 group-hover:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExampleList({
  spec,
  onAdd,
  onRemove,
}: {
  spec: SpecProject;
  onAdd: (input: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-medium text-slate-500">Examples / edge cases</label>
        <IconButton
          title="Add example"
          onClick={() => {
            const text = window.prompt("Example input");
            if (text?.trim()) onAdd(text.trim());
          }}
        >
          <Plus size={14} />
        </IconButton>
      </div>
      <div className="space-y-1.5">
        {spec.examples.length === 0 && <p className="text-xs text-slate-400">None yet.</p>}
        {spec.examples.map((ex) => (
          <div
            key={ex.id}
            className="group flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"
          >
            <span className="flex-1 text-xs text-slate-700">{ex.input}</span>
            <button
              onClick={() => onRemove(ex.id)}
              className="shrink-0 text-slate-400 opacity-0 hover:text-rose-600 group-hover:opacity-100"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
