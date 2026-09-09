import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  Copy,
  FolderInput,
  FolderOutput,
  Pencil,
  Plus,
  ShieldQuestion,
  Trash2,
} from "lucide-react";
import { useStore } from "../../store";
import { useAssistantActions } from "../../assistantContext";
import type { Assertion, AssertionTier, CodeCheckMode, JudgePolicy, SpecProject } from "../../types";
import { ASSERTION_MODE_CATALOG, ASSERTION_MODE_GROUPS, getModeSpec } from "../../assertionCatalog";
import { markArtifactManuallyEdited, newAssertionManual, syncJudgePolicy } from "../../specFactory";
import { assertionToLibraryEntry, type SaveToLibraryMeta } from "../../libraryFactory";
import { DEFAULT_JUDGE_SYSTEM_PROMPT, DEFAULT_JUDGE_TEMPERATURE } from "../../judgeDefaults";
import { MODELS } from "../prompts/PromptPlaygroundBody";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SaveToLibraryModal } from "../library/SaveToLibraryModal";
import { LoadFromLibraryModal } from "../library/LoadFromLibraryModal";

const TIER_META: Record<
  AssertionTier,
  { label: string; tone: "success" | "warning" | "info"; dot: string; accent: string }
> = {
  deterministic: { label: "Deterministic", tone: "success", dot: "bg-emerald-500", accent: "border-l-emerald-300" },
  custom_code: { label: "Custom code", tone: "warning", dot: "bg-amber-500", accent: "border-l-amber-300" },
  rubric_grading: { label: "LLM judge", tone: "info", dot: "bg-primary", accent: "border-l-primary/40" },
};

/** Always rendered in this order — cheapest tier first, matching the promptfoo-parity cost hierarchy. */
const ASSERTION_TIERS: AssertionTier[] = ["deterministic", "custom_code", "rubric_grading"];

const UNGROUPED = "Ungrouped";
const CREATE_GROUP_OPTION = "__create_new_group__";

function AssertionSummary({
  assertions,
  defaultPassThreshold,
  onChangeDefaultPassThreshold,
}: {
  assertions: Assertion[];
  defaultPassThreshold: number;
  onChangeDefaultPassThreshold: (pct: number) => void;
}) {
  const total = assertions.length;
  const linkedCount = assertions.filter((assertion) => assertion.sourceRequirementId).length;
  const libraryCount = assertions.filter((assertion) => assertion.libraryOrigin).length;
  const manualCount = assertions.filter(
    (assertion) => !assertion.sourceRequirementId && !assertion.libraryOrigin,
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
                      ? "h-full rounded-full bg-emerald-500"
                      : tier === "custom_code"
                        ? "h-full rounded-full bg-amber-500"
                        : "h-full rounded-full bg-primary"
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
      <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
        <span className="font-medium text-slate-700">Default passing threshold</span>
        <input
          type="number"
          min={0}
          max={100}
          value={Math.round(defaultPassThreshold * 100)}
          onChange={(e) => onChangeDefaultPassThreshold(Number(e.target.value))}
          className="w-16 rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-800 outline-none focus:border-ring"
        />
        <span>%</span>
        <span className="text-slate-400">
          — the share of dataset rows an assertion must pass in Results, unless it sets its own threshold below.
        </span>
      </div>
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
        className="w-full rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-ring"
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
        <Input
          value={check.value}
          onChange={(e) => onChange({ check: { ...check, value: e.target.value } })}
          placeholder={spec.valuePlaceholder}
          className="text-xs"
        />
      )}
      {spec.needsReference && (
        <Input
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
            className="w-28 rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-800 outline-none focus:border-ring"
          />
        </div>
      )}
      {spec.needsMinMax && (
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
            Min words
            <input
              type="number"
              min={0}
              value={check.min ?? ""}
              onChange={(e) =>
                onChange({ check: { ...check, min: e.target.value === "" ? undefined : Number(e.target.value) } })
              }
              placeholder="—"
              className="w-20 rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-800 outline-none focus:border-ring"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
            Max words
            <input
              type="number"
              min={0}
              value={check.max ?? ""}
              onChange={(e) =>
                onChange({ check: { ...check, max: e.target.value === "" ? undefined : Number(e.target.value) } })
              }
              placeholder="—"
              className="w-20 rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-800 outline-none focus:border-ring"
            />
          </label>
        </div>
      )}
      <Textarea
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
          className="rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-ring"
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
        className="w-full resize-none rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 font-mono text-xs text-slate-800 outline-none focus:border-ring"
      />
      <Textarea
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

/** Assign an assertion to an existing free-text group, or create a new one inline. */
function GroupSelect({
  value,
  groupOptions,
  onChange,
}: {
  value: string | undefined;
  groupOptions: string[];
  onChange: (group: string | undefined) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");

  function commit() {
    onChange(draft.trim() || undefined);
    setCreating(false);
    setDraft("");
  }

  if (creating) {
    return (
      <span className="inline-flex items-center gap-1">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setCreating(false);
              setDraft("");
            }
          }}
          placeholder="New group name"
          className="w-32 py-1 text-xs"
        />
        <button type="button" title="Create group" onClick={commit} className="text-primary hover:text-primary/80">
          <Check size={14} />
        </button>
      </span>
    );
  }

  return (
    <select
      value={value ?? ""}
      onChange={(e) => {
        if (e.target.value === CREATE_GROUP_OPTION) {
          setCreating(true);
        } else {
          onChange(e.target.value || undefined);
        }
      }}
      className="w-40 rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-800 outline-none focus:border-ring"
    >
      <option value="">{UNGROUPED}</option>
      {groupOptions.map((g) => (
        <option key={g} value={g}>
          {g}
        </option>
      ))}
      <option value={CREATE_GROUP_OPTION}>+ Create new group…</option>
    </select>
  );
}

/** A group's section header: click the name/chevron to expand/collapse, click the pencil to rename
 *  it in place — renaming applies to every assertion sharing that group name, across every tier. */
function GroupHeader({
  name,
  count,
  collapsed,
  onToggle,
  onRename,
}: {
  name: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  onRename: (newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
    setEditing(false);
  }

  if (editing) {
    return (
      <span className="flex w-full items-center gap-2 px-3 py-1.5">
        {collapsed ? <ChevronRight size={14} className="shrink-0 text-slate-500" /> : <ChevronDown size={14} className="shrink-0 text-slate-500" />}
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(name);
              setEditing(false);
            }
          }}
          className="h-6 max-w-48 py-1 text-xs"
        />
        <button type="button" title="Save group name" onClick={commit} className="text-primary hover:text-primary/80">
          <Check size={14} />
        </button>
      </span>
    );
  }

  return (
    <div className="flex w-full items-center gap-2 px-3 py-2">
      <button onClick={onToggle} className="flex flex-1 items-center gap-2 text-left">
        {collapsed ? <ChevronRight size={14} className="shrink-0 text-slate-500" /> : <ChevronDown size={14} className="shrink-0 text-slate-500" />}
        <span className="text-xs font-semibold text-slate-800">{name}</span>
        <Badge>{count}</Badge>
      </button>
      <button
        type="button"
        title="Rename group"
        onClick={() => {
          setDraft(name);
          setEditing(true);
        }}
        className="shrink-0 text-slate-300 hover:text-primary"
      >
        <Pencil size={13} />
      </button>
    </div>
  );
}

function GroupAndThresholdRow({
  assertion,
  groupOptions,
  defaultPassThreshold,
  onChange,
}: {
  assertion: Assertion;
  groupOptions: string[];
  defaultPassThreshold: number;
  onChange: (patch: Partial<Assertion>) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
      <label className="flex items-center gap-1.5">
        Group
        <GroupSelect value={assertion.group} groupOptions={groupOptions} onChange={(group) => onChange({ group })} />
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
          className="w-28 rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-800 outline-none focus:border-ring"
        />
        %
      </label>
    </div>
  );
}

/** Lets any assertion — manual, library-loaded, or generated — link to (or unlink from) a Spec requirement. */
function RequirementLinkSelect({
  spec,
  assertion,
  onChange,
}: {
  spec: SpecProject;
  assertion: Assertion;
  onChange: (requirementId: string | null) => void;
}) {
  const currentId = assertion.sourceRequirementId;
  const isOrphaned = !!currentId && !spec.requirements.some((r) => r.id === currentId);

  return (
    <label className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
      <span className="shrink-0">From:</span>
      <select
        value={currentId ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="min-w-0 max-w-full flex-1 truncate rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-700 outline-none focus:border-ring"
      >
        <option value="">Manually added</option>
        {isOrphaned && <option value={currentId}>Requirement removed from Spec — orphaned</option>}
        {spec.requirements.length > 0 && (
          <optgroup label="Requirements">
            {spec.requirements.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} — {r.statement}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}

export function EvalPane({ spec }: { spec: SpecProject }) {
  const { updateSpec, saveToLibrary, pinFromLibrary, currentUserId } = useStore();
  const { openWithPrompt } = useAssistantActions();
  const [savingAssertion, setSavingAssertion] = useState<Assertion | null>(null);
  const [loadingAssertion, setLoadingAssertion] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  function patchAssertions(fn: (list: Assertion[]) => Assertion[]) {
    updateSpec(spec.id, (s) =>
      markArtifactManuallyEdited(syncJudgePolicy({ ...s, assertions: fn(s.assertions), updatedAt: Date.now() }), "assertions"),
    );
  }

  function updateAssertion(id: string, patch: Partial<Assertion>) {
    patchAssertions((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  function updateJudge(patch: Partial<JudgePolicy>) {
    updateSpec(spec.id, (s) => (s.judge ? { ...s, judge: { ...s.judge, ...patch }, updatedAt: Date.now() } : s));
  }

  function setDefaultPassThreshold(pct: number) {
    updateSpec(spec.id, (s) => ({ ...s, defaultPassThreshold: pctToFraction(pct), updatedAt: Date.now() }));
  }

  function handleSaveAssertion(meta: SaveToLibraryMeta) {
    if (!savingAssertion) return;
    saveToLibrary("assertions", assertionToLibraryEntry(savingAssertion, spec, meta));
  }

  const groupOptions = [...new Set(spec.assertions.map((a) => a.group).filter((g): g is string => !!g))].sort();

  const assertionsByTier = new Map<AssertionTier, Assertion[]>();
  for (const tier of ASSERTION_TIERS) assertionsByTier.set(tier, []);
  for (const a of spec.assertions) assertionsByTier.get(a.tier)?.push(a);

  function subGroupsFor(tier: AssertionTier): { key: string; items: Assertion[] }[] {
    const list = assertionsByTier.get(tier) ?? [];
    const order: string[] = [];
    const byGroup = new Map<string, Assertion[]>();
    for (const a of list) {
      const key = a.group?.trim() || UNGROUPED;
      if (!byGroup.has(key)) {
        byGroup.set(key, []);
        order.push(key);
      }
      byGroup.get(key)!.push(a);
    }
    return order.map((key) => ({ key, items: byGroup.get(key)! }));
  }

  function toggleGroup(groupKey: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  function allGroupKeys(): string[] {
    return ASSERTION_TIERS.flatMap((tier) => subGroupsFor(tier).map(({ key }) => `${tier}::${key}`));
  }

  function expandAllGroups() {
    setCollapsedGroups(new Set());
  }

  function collapseAllGroups() {
    setCollapsedGroups(new Set(allGroupKeys()));
  }

  /** Renames a group everywhere it's used (every tier, not just the section it was clicked from). */
  function renameGroup(oldKey: string, newName: string) {
    const finalName = newName.trim() || UNGROUPED;
    patchAssertions((list) =>
      list.map((a) =>
        (a.group?.trim() || UNGROUPED) === oldKey ? { ...a, group: finalName === UNGROUPED ? undefined : finalName } : a,
      ),
    );
    setCollapsedGroups((prev) => {
      const next = new Set<string>();
      for (const k of prev) {
        const [tier, key] = k.split("::");
        next.add(key === oldKey ? `${tier}::${finalName}` : k);
      }
      return next;
    });
  }

  function renderAssertionCard(a: Assertion) {
    const tierMeta = TIER_META[a.tier];
    return (
      <div
        key={a.id}
        className={`rounded-lg border border-slate-200 border-l-[3px] ${tierMeta.accent} bg-white p-3 shadow-sm shadow-slate-900/5 transition-shadow hover:shadow-md`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={tierMeta.tone}>{tierMeta.label}</Badge>
            {a.libraryOrigin && <Badge>From library</Badge>}
            <button
              type="button"
              title="Click to copy the assertion ID"
              onClick={() => void navigator.clipboard?.writeText(a.id)}
              className="flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 hover:bg-slate-200 hover:text-slate-600"
            >
              <Copy size={9} />
              {a.id}
            </button>
          </div>
          <div className="flex items-center gap-1">
            {a.tier === "rubric_grading" && (
              <button
                title="Opens North Star to help tune this rubric's wording"
                onClick={() =>
                  openWithPrompt(
                    `Help me tighten the wording of this grading rubric so it's a single, specific, checkable sentence:\n\n"${a.rubric ?? ""}"`,
                  )
                }
                className="text-slate-400 hover:text-primary"
              >
                <Compass size={14} />
              </button>
            )}
            <button
              title="Save to library"
              onClick={() => setSavingAssertion(a)}
              className="text-slate-400 hover:text-primary"
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
        <RequirementLinkSelect
          spec={spec}
          assertion={a}
          onChange={(requirementId) => updateAssertion(a.id, { sourceRequirementId: requirementId })}
        />

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
            className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-ring"
          />
        )}
        <GroupAndThresholdRow
          assertion={a}
          groupOptions={groupOptions}
          defaultPassThreshold={spec.defaultPassThreshold}
          onChange={(patch) => updateAssertion(a.id, patch)}
        />
      </div>
    );
  }

  function renderJudgePolicyCard() {
    if (!spec.judge) {
      return (
        <p className="mb-3 text-xs text-slate-500">
          No LLM-judge assertions yet, so no judge policy is needed — add one below and a default policy is created
          automatically.
        </p>
      );
    }
    return (
      <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-800">
          <ShieldQuestion size={15} className="text-primary" />
          Judge policy
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={spec.judge.model}
            onChange={(e) => updateJudge({ model: e.target.value })}
            className="rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-ring"
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
              className="w-16 rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-800 outline-none focus:border-ring"
            />
          </label>
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
            className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-ring"
          />
        </div>
      </div>
    );
  }

  function renderTierSection(tier: AssertionTier) {
    const tierMeta = TIER_META[tier];
    const groups = subGroupsFor(tier);
    const count = assertionsByTier.get(tier)?.length ?? 0;

    return (
      <div key={tier} className={`rounded-xl border border-slate-200 border-l-4 ${tierMeta.accent} bg-slate-50/60 p-3`}>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`size-1.5 shrink-0 rounded-full ${tierMeta.dot}`} />
            <h4 className="text-sm font-semibold text-slate-800">{tierMeta.label}</h4>
            <Badge tone={tierMeta.tone}>{count}</Badge>
          </div>
          <Button size="sm" onClick={() => patchAssertions((list) => [newAssertionManual(tier), ...list])}>
            <Plus size={13} /> Add manually
          </Button>
        </div>
        {tier === "rubric_grading" && renderJudgePolicyCard()}
        {count === 0 ? (
          <p className="text-sm text-slate-500">No {tierMeta.label.toLowerCase()} assertions yet.</p>
        ) : (
          <div className="space-y-2">
            {groups.map(({ key, items }) => {
              const groupKey = `${tier}::${key}`;
              const collapsed = collapsedGroups.has(groupKey);
              return (
                <div key={groupKey} className="rounded-xl border border-slate-200 bg-white">
                  <GroupHeader
                    name={key}
                    count={items.length}
                    collapsed={collapsed}
                    onToggle={() => toggleGroup(groupKey)}
                    onRename={(newName) => renameGroup(key, newName)}
                  />
                  {!collapsed && (
                    <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 p-2">
                      {items.map(renderAssertionCard)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">
            Assertions <span className="text-slate-500">({spec.assertions.length})</span>
          </h3>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <button type="button" onClick={expandAllGroups} className="hover:text-slate-700">
                Expand all
              </button>
              <span>·</span>
              <button type="button" onClick={collapseAllGroups} className="hover:text-slate-700">
                Collapse all
              </button>
            </div>
            <Button size="sm" onClick={() => setLoadingAssertion(true)}>
              <FolderInput size={13} /> Load from Library
            </Button>
          </div>
        </div>
        <AssertionSummary
          assertions={spec.assertions}
          defaultPassThreshold={spec.defaultPassThreshold}
          onChangeDefaultPassThreshold={setDefaultPassThreshold}
        />
        {spec.assertions.length === 0 && (
          <p className="mb-3 text-sm text-slate-500">
            No assertions yet — Generate from the Spec, add one manually below, or load one from the Library.
          </p>
        )}
        <div className="space-y-6">{ASSERTION_TIERS.map((tier) => renderTierSection(tier))}</div>
      </div>

      {savingAssertion && (
        <SaveToLibraryModal
          title="Save Assertion to Library"
          defaultName={savingAssertion.description.slice(0, 60)}
          ownerId={currentUserId}
          visibilityLocked="private"
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
    </div>
  );
}
