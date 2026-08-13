import { useState } from "react";
import { Bot, CheckCircle2, MessageSquare, Rocket, XCircle } from "lucide-react";
import { useStore } from "../../store";
import type { SpecProject, Verdict } from "../../types";
import { computeCoverage } from "../../coverage";
import { newId } from "../../utils/id";
import { Badge, Button, TextArea } from "../ui";

export function ReviewPane({ spec }: { spec: SpecProject }) {
  const { updateSpec } = useStore();
  const [draft, setDraft] = useState("");
  const lastRun = spec.runs[spec.runs.length - 1];
  const coverage = computeCoverage(spec);

  if (!lastRun?.citable) {
    return (
      <p className="text-sm text-slate-500">
        Review needs a citable run first — hit Publish in the top bar (this freezes the bundle and auto-triggers
        the citable run).
      </p>
    );
  }

  const findings = buildAiFindings(spec, coverage, lastRun);

  function addComment() {
    if (!draft.trim()) return;
    updateSpec(spec.id, (s) => ({
      ...s,
      comments: [
        ...s.comments,
        {
          id: newId("comment"),
          author: "You",
          authorKind: "human" as const,
          text: draft.trim(),
          anchor: "general",
          resolved: false,
          createdAt: Date.now(),
        },
      ],
    }));
    setDraft("");
  }

  function setVerdict(verdict: Verdict) {
    updateSpec(spec.id, (s) => ({ ...s, verdict, released: verdict === "approved" ? true : s.released }));
  }

  const verdictTone = spec.verdict === "approved" ? "success" : spec.verdict === "changes_requested" ? "danger" : "neutral";

  return (
    <div className="max-w-5xl space-y-5">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 flex items-center gap-2 text-sm text-slate-800">
          <Bot size={15} className="text-sky-600" /> AI review agent — first pass
        </div>
        <ul className="space-y-1.5">
          {findings.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
              {f.ok ? (
                <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-600" />
              ) : (
                <XCircle size={12} className="mt-0.5 shrink-0 text-amber-600" />
              )}
              {f.text}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-slate-400">Comments only — never approves. The verdict below is yours.</p>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <MessageSquare size={14} /> Comments
        </div>
        <div className="space-y-2">
          {spec.comments.length === 0 && <p className="text-xs text-slate-500">No comments yet.</p>}
          {spec.comments.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-medium text-slate-600">{c.author}</p>
              <p className="mt-0.5 text-xs text-slate-700">{c.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <TextArea rows={2} placeholder="Leave a comment…" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <Button onClick={addComment}>Post</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="text-xs text-slate-600">
          Verdict: <Badge tone={verdictTone}>{spec.verdict.replace("_", " ")}</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="danger" onClick={() => setVerdict("changes_requested")}>
            Request changes
          </Button>
          <Button variant="primary" onClick={() => setVerdict("approved")}>
            <Rocket size={13} /> Approve & release
          </Button>
        </div>
      </div>

      {spec.released && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          Released — this is now the latest published version, served via the API.
        </div>
      )}
    </div>
  );
}

function buildAiFindings(
  spec: SpecProject,
  coverage: { total: number; covered: number },
  lastRun: SpecProject["runs"][number],
) {
  const findings: { ok: boolean; text: string }[] = [
    coverage.covered === coverage.total
      ? { ok: true, text: `All ${coverage.total} requirements have a covering assertion.` }
      : { ok: false, text: `${coverage.total - coverage.covered} requirement(s) have no covering assertion.` },
    {
      ok: true,
      text: spec.judge ? `Judge policy in use: ${spec.judge.model}.` : "No LLM-as-judge assertions in this Eval.",
    },
    belowThreshold(spec, lastRun),
    lastRun.passRate === 1
      ? { ok: false, text: "100% pass rate — consider whether the dataset is stress-testing anything." }
      : { ok: true, text: `Citable run pass rate: ${Math.round(lastRun.passRate * 100)}%.` },
  ];
  return findings;
}

function belowThreshold(spec: SpecProject, lastRun: SpecProject["runs"][number]): { ok: boolean; text: string } {
  const misses = spec.assertions.filter((a) => {
    const scores = lastRun.results.flatMap((r) => r.scores.filter((s) => s.assertionId === a.id));
    if (scores.length === 0) return false;
    const passRate = scores.filter((s) => s.passed).length / scores.length;
    return passRate < (a.passThreshold ?? spec.defaultPassThreshold);
  });
  return misses.length === 0
    ? { ok: true, text: "Every assertion meets its passing threshold on this run." }
    : { ok: false, text: `${misses.length} assertion(s) fell below their passing threshold — see Results.` };
}
