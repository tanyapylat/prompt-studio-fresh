import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Compass,
  FolderInput,
  FolderOutput,
  ShieldQuestion,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useStore } from "../../store";
import { useAssistantActions } from "../../assistantContext";
import type { Assertion, AssertionTier, CodeCheckMode, JudgePolicy, SpecProject } from "../../types";
import { ASSERTION_MODE_CATALOG, ASSERTION_MODE_GROUPS, getModeSpec } from "../../assertionCatalog";
import { markEdited, newAssertionManual } from "../../specFactory";
import { assertionToLibraryEntry, judgeToLibraryEntry, type SaveToLibraryMeta } from "../../libraryFactory";
import { DEFAULT_JUDGE_SYSTEM_PROMPT, DEFAULT_JUDGE_TEMPERATURE } from "../../judgeDefaults";
import { MODELS } from "../prompts/PromptPlaygroundBody";
import { Badge, Button, TextArea, TextInput } from "../ui";
import { SaveToLibraryModal } from "../library/SaveToLibraryModal";
import { LoadFromLibraryModal } from "../library/LoadFromLibraryModal";

const TIER_META: Record<AssertionTier, { label: string; tone: "info" | "warning" | "accent" }> = {
  deterministic: { label: "Deterministic", tone: "info" },
  custom_code: { label: "Custom code", tone: "warning" },
  rubric_grading: { label: "LLM judge", tone: "accent" },
};

const ASSERTION_TIERS: AssertionTier[] = ["deterministic", "custom_code", "rubric_grading"];

const UNGROUPED = "Ungrouped";

function AssertionSummary({ assertions }: { assertions: Assertion[] }) {
  const total = assertions.length;
  const linkedCount = assertions.filter((assertion) => assertion.sourceCriterionId).length;
  const libraryCount = assertions.filter((assertion) => assertion.libraryOrigin).length;
  const manualCount = assertions.filter(
    (assertion) => !assertion.sourceCriterionId && !assertion.libraryOrigin,
  ).length;

  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-800">Assertion mix</p>
          <p className="mt-0.5 text-[11px] text-slate-500">A quick view of what this eval checks.</p>
        </div>
        <Badge>{total} total</Badge>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {ASSERTION_TIERS.map((tier) => {
          const count = assertions.filter((assertion) => assertion.tier === tier).length;
          const percentage = total ? Math.round((count / total) * 100) : 0;
          const meta = TIER_META[tier];
          return (
            <div key={tier} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <Badge tone={meta.tone}>{meta.label}</Badge>
                <span className="text-base font-semibold text-slate-900">{count}</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={
                    tier === "deterministic"
                      ? "h-full rounded-full bg-sky-500"
                      : tier === "custom_code"
                        ? "h-full rounded-full bg-amber-500"
                        : "h-full rounded-full bg-slate-500"
                  }
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-400">{percentage}% of assertions</p>
            </div>
          );
        })}
      </div>
      {total > 0 && (
        <p className="mt-2 text-[11px] text-slate-500">
          {linkedCount} linked to Spec · {manualCount} manual · {libraryCount} from Library
        </p>
      )}
    </div>
  );
}

function DeterministicEditor({ assertion, onChange }: { assertion: Assertion; onChange: (patch: Partial<Assertion>) => void }) {
  const check = assertion.check ?? { mode: "contains" as CodeCheckMode, value: "" };
  const spec = getModeSpec(check.mode);

  return (
    <div className="mt-2 space-y-2">
      <select
        value={check.mode}
        onChange={(e) => onChange({ check: { ...check, mode: e.target.value as CodeCheckMode } })}
        className="w-full rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-sky-500"
      >
        {ASSERTION_MODE_GROUPS.map((group) => (
          <optgroup key={group} label={group}>
            {ASSERTION_MODE_CATALOG.filter((m) => m.group === group).map((m) => (
              <option key={m.mode} value={m.mode}>
                {m.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <p className="text-[11px] text-slate-500">{spec.hint}</p>
      {spec.needsValue && (
        <TextInput
          value={check.value}
          onChange={(e) => onChange({ check: { ...check, value: e.target.value } })}
          placeholder={spec.valuePlaceholder}
          className="text-xs"
        />
      )}
      {spec.needsReference && (
        <TextInput
          value={check.reference ?? ""}
          onChange={(e) => onChange({ check: { ...check, reference: e.target.value } })}
          placeholder={spec.referencePlaceholder}
          className="text-xs"
        />
      )}
      {spec.needsThreshold && (
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-slate-500">{spec.thresholdLabel}</label>
          <input
            type="number"
            step="any"
            value={check.threshold ?? spec.thresholdDefault ?? 0}
            onChange={(e) => onChange({ check: { ...check, threshold: Number(e.target.value) } })}
            className="w-28 rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-800 outline-none focus:border-sky-500"
          />
        </div>
      )}
      <TextArea
        rows={2}
        value={assertion.description}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="Human-readable description of this check"
        className="text-xs"
      />
    </div>
  );
}

function CustomCodeEditor({ assertion, onChange }: { assertion: Assertion; onChange: (patch: Partial<Assertion>) => void }) {
  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={assertion.codeLanguage ?? "javascript"}
          onChange={(e) => onChange({ codeLanguage: e.target.value as "javascript" | "python" })}
          className="rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-sky-500"
        >
          <option value="javascript">JavaScript (executes for real)</option>
          <option value="python">Python (stored only — no in-browser runtime, treated as a documented gap)</option>
        </select>
      </div>
      <textarea
        rows={4}
        value={assertion.code ?? ""}
        onChange={(e) => onChange({ code: e.target.value })}
        placeholder="return output.length > 0;"
        className="w-full resize-none rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 font-mono text-xs text-slate-800 outline-none focus:border-sky-500"
      />
      <TextArea
        rows={2}
        value={assertion.description}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="Human-readable description of this check"
        className="text-xs"
      />
    </div>
  );
}

/** Percent (0-100) shown/edited in the UI <-> fraction (0-1) stored on the Assertion/Spec. */
function pctToFraction(pct: number): number {
  return Math.max(0, Math.min(100, pct)) / 100;
}

function GroupAndThresholdRow({
  assertion,
  defaultPassThreshold,
  onChange,
}: {
  assertion: Assertion;
  defaultPassThreshold: number;
  onChange: (patch: Partial<Assertion>) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
      <label className="flex items-center gap-1.5">
        Group
        <input
          list="assertion-group-options"
          value={assertion.group ?? ""}
          onChange={(e) => onChange({ group: e.target.value || undefined })}
          placeholder={UNGROUPED}
          className="w-36 rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-800 outline-none focus:border-sky-500"
        />
      </label>
      <label className="flex items-center gap-1.5">
        Passing threshold
        <input
          type="number"
          min={0}
          max={100}
          value={assertion.passThreshold !== undefined ? Math.round(assertion.passThreshold * 100) : ""}
          onChange={(e) =>
            onChange({ passThreshold: e.target.value === "" ? undefined : pctToFraction(Number(e.target.value)) })
          }
          placeholder={`Default (${Math.round(defaultPassThreshold * 100)}%)`}
          className="w-28 rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-800 outline-none focus:border-sky-500"
        />
        %
      </label>
    </div>
  );
}

export function EvalPane({ spec }: { spec: SpecProject }) {
  const { updateSpec, saveToLibrary, pinFromLibrary, currentUserId } = useStore();
  const { openWithPrompt } = useAssistantActions();
  const [savingAssertion, setSavingAssertion] = useState<Assertion | null>(null);
  const [loadingAssertion, setLoadingAssertion] = useState(false);
  const [addTier, setAddTier] = useState<AssertionTier>("deterministic");
  const [judgeModal, setJudgeModal] = useState<"save" | "load" | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  function patchAssertions(fn: (list: Assertion[]) => Assertion[]) {
    updateSpec(spec.id, (s) => markEdited({ ...s, assertions: fn(s.assertions), updatedAt: Date.now() }));
  }

  function updateAssertion(id: string, patch: Partial<Assertion>) {
    patchAssertions((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  function updateJudge(patch: Partial<JudgePolicy>) {
    updateSpec(spec.id, (s) => (s.judge ? markEdited({ ...s, judge: { ...s.judge, ...patch }, updatedAt: Date.now() }) : s));
  }

  function setDefaultPassThreshold(pct: number) {
    updateSpec(spec.id, (s) => markEdited({ ...s, defaultPassThreshold: pctToFraction(pct), updatedAt: Date.now() }));
  }

  function requirementLabel(criterionId: string | null) {
    if (!criterionId) return "Manually added";
    const found = [...spec.guardrails, ...spec.criteria].find((c) => c.id === criterionId);
    return found ? found.text : "Requirement removed from Spec — orphaned";
  }

  function handleSaveAssertion(meta: SaveToLibraryMeta) {
    if (!savingAssertion) return;
    saveToLibrary("assertions", assertionToLibraryEntry(savingAssertion, spec, meta));
  }

  function handleSaveJudge(meta: SaveToLibraryMeta) {
    saveToLibrary("judgePolicies", judgeToLibraryEntry(spec, meta));
  }

  const groupOptions = useMemo(
    () => [...new Set(spec.assertions.map((a) => a.group).filter((g): g is string => !!g))].sort(),
    [spec.assertions],
  );

  const groupedAssertions = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, Assertion[]>();
    for (const a of spec.assertions) {
      const key = a.group?.trim() || UNGROUPED;
      if (!byGroup.has(key)) {
        byGroup.set(key, []);
        order.push(key);
      }
      byGroup.get(key)!.push(a);
    }
    return order.map((key) => ({ key, items: byGroup.get(key)! }));
  }, [spec.assertions]);

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function renderAssertionCard(a: Assertion) {
    const tierMeta = TIER_META[a.tier];
    return (
      <div key={a.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge tone={tierMeta.tone}>{tierMeta.label}</Badge>
            {a.status === "published" && <Badge tone="success">Published</Badge>}
            {a.libraryOrigin && <Badge>From library</Badge>}
          </div>
          <div className="flex items-center gap-1">
            {a.tier === "rubric_grading" && (
              <button
                title="Ask North Star to help tune this rubric's wording"
                onClick={() =>
                  openWithPrompt(
                    `Help me tighten the wording of this grading rubric so it's a single, specific, checkable sentence:\n\n"${a.rubric ?? ""}"`,
                  )
                }
                className="text-slate-400 hover:text-sky-600"
              >
                <Compass size={14} />
              </button>
            )}
            <button
              title="Save to library"
              onClick={() => setSavingAssertion(a)}
              className="text-slate-400 hover:text-sky-600"
            >
              <FolderOutput size={14} />
            </button>
            <button
              onClick={() => patchAssertions((list) => list.filter((x) => x.id !== a.id))}
              className="text-slate-400 hover:text-rose-600"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">From: {requirementLabel(a.sourceCriterionId)}</p>

        {a.tier === "deterministic" && (
          <DeterministicEditor assertion={a} onChange={(patch) => updateAssertion(a.id, patch)} />
        )}
        {a.tier === "custom_code" && (
          <CustomCodeEditor assertion={a} onChange={(patch) => updateAssertion(a.id, patch)} />
        )}
        {a.tier === "rubric_grading" && (
          <textarea
            rows={2}
            value={a.rubric ?? ""}
            onChange={(e) => updateAssertion(a.id, { rubric: e.target.value })}
            className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-sky-500"
          />
        )}
        <GroupAndThresholdRow
          assertion={a}
          defaultPassThreshold={spec.defaultPassThreshold}
          onChange={(patch) => updateAssertion(a.id, patch)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <datalist id="assertion-group-options">
        {groupOptions.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">
            Assertions <span className="text-slate-500">({spec.assertions.length})</span>
          </h3>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setLoadingAssertion(true)}>
              <FolderInput size={13} /> Load from Library
            </Button>
            <select
              value={addTier}
              onChange={(e) => setAddTier(e.target.value as AssertionTier)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-sky-500"
            >
              <option value="deterministic">Deterministic</option>
              <option value="custom_code">Custom code</option>
              <option value="rubric_grading">LLM judge</option>
            </select>
            <Button size="sm" onClick={() => patchAssertions((list) => [newAssertionManual(addTier), ...list])}>
              <Sparkles size={13} /> Add manually
            </Button>
          </div>
        </div>
        <AssertionSummary assertions={spec.assertions} />
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          <span className="font-medium text-slate-700">Default passing threshold</span>
          <input
            type="number"
            min={0}
            max={100}
            value={Math.round(spec.defaultPassThreshold * 100)}
            onChange={(e) => setDefaultPassThreshold(Number(e.target.value))}
            className="w-16 rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-800 outline-none focus:border-sky-500"
          />
          <span>%</span>
          <span className="text-slate-400">
            — the share of dataset rows an assertion must pass in Results, unless it sets its own threshold below.
          </span>
        </div>
        <div className="space-y-3">
          {spec.assertions.length === 0 && (
            <p className="text-sm text-slate-500">No assertions yet — Generate from the Spec, add one manually, or load one from the Library.</p>
          )}
          {groupedAssertions.map(({ key, items }) => {
            const collapsed = collapsedGroups.has(key);
            return (
              <div key={key} className="rounded-xl border border-slate-200 bg-white">
                <button
                  onClick={() => toggleGroup(key)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left"
                >
                  {collapsed ? (
                    <ChevronRight size={14} className="shrink-0 text-slate-500" />
                  ) : (
                    <ChevronDown size={14} className="shrink-0 text-slate-500" />
                  )}
                  <span className="text-xs font-semibold text-slate-800">{key}</span>
                  <Badge>{items.length}</Badge>
                </button>
                {!collapsed && <div className="space-y-2 border-t border-slate-100 p-3">{items.map(renderAssertionCard)}</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Judge policy</h3>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setJudgeModal("load")}>
              <FolderInput size={13} /> Load from Library
            </Button>
            {spec.judge && (
              <Button size="sm" onClick={() => setJudgeModal("save")}>
                <FolderOutput size={13} /> Save to Library
              </Button>
            )}
            {spec.judge && (
              <Button
                size="sm"
                onClick={() => {
                  if (window.confirm("Remove the judge policy from this Spec?")) {
                    updateSpec(spec.id, (s) => markEdited({ ...s, judge: null, updatedAt: Date.now() }));
                  }
                }}
              >
                <X size={13} /> Remove
              </Button>
            )}
          </div>
        </div>
        {!spec.judge ? (
          <p className="text-sm text-slate-500">No LLM-as-judge assertions yet, so no judge is needed.</p>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm text-slate-800">
                <ShieldQuestion size={15} className="text-sky-600" />
              </div>
              <select
                value={spec.judge.model}
                onChange={(e) => updateJudge({ model: e.target.value })}
                className="rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-sky-500"
              >
                {MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                Temperature
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={spec.judge.temperature ?? DEFAULT_JUDGE_TEMPERATURE}
                  onChange={(e) => updateJudge({ temperature: Number(e.target.value) })}
                  className="w-16 rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-800 outline-none focus:border-sky-500"
                />
              </label>
              {spec.judge.libraryOrigin && <Badge>From library</Badge>}
            </div>
            <div className="mt-3">
              <label className="text-[11px] font-medium text-slate-500">
                Grading instructions (the judge's system prompt — leave blank to use the default)
              </label>
              <textarea
                rows={3}
                value={spec.judge.systemPrompt ?? ""}
                onChange={(e) => updateJudge({ systemPrompt: e.target.value })}
                placeholder={DEFAULT_JUDGE_SYSTEM_PROMPT}
                className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-sky-500"
              />
            </div>
          </div>
        )}
      </div>

      {savingAssertion && (
        <SaveToLibraryModal
          title="Save Assertion to Library"
          defaultName={savingAssertion.description.slice(0, 60)}
          ownerId={currentUserId}
          onSave={handleSaveAssertion}
          onClose={() => setSavingAssertion(null)}
        />
      )}
      {loadingAssertion && (
        <LoadFromLibraryModal
          title="Load Assertion from Library"
          kind="assertions"
          onPick={(entry) => {
            pinFromLibrary("assertions", entry.id, spec.id);
          }}
          onClose={() => setLoadingAssertion(false)}
        />
      )}
      {judgeModal === "save" && (
        <SaveToLibraryModal
          title="Save Judge Policy to Library"
          defaultName={`${spec.name} — Judge`}
          ownerId={currentUserId}
          onSave={handleSaveJudge}
          onClose={() => setJudgeModal(null)}
        />
      )}
      {judgeModal === "load" && (
        <LoadFromLibraryModal
          title="Load Judge Policy from Library"
          kind="judgePolicies"
          onPick={(entry) => {
            pinFromLibrary("judgePolicies", entry.id, spec.id);
          }}
          onClose={() => setJudgeModal(null)}
        />
      )}
    </div>
  );
}
