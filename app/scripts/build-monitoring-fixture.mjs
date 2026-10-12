// Builds src/seed/monitoringFixture.generated.ts from real online-eval results exported by Promptfoo
// (GET /api/results/<evalId> — one JSON file per eval, saved in a cache directory).
//
// Usage:  node scripts/build-monitoring-fixture.mjs [cacheDir]
//         (cacheDir defaults to $MONITORING_CACHE_DIR, then /tmp/a2e/cache)
//
// Each eval becomes one small AGGREGATE (counts, percentiles, failure-pattern counts), not one row per
// conversation, so hundreds of runs stay cheap to ship. Failing-conversation chat ids are kept only for
// the latest RECENT_RUNS runs.
//
// WHICH EVALS — several online evals can share one description ("A2E Intake — shared") because other
// prompts' schedules reuse the same config name, and nothing inside an eval result says which prompt it
// belongs to. So the monitored stream is selected by SCHEDULE instead: start at a known first eval of the
// wanted schedule (ANCHOR_EVAL_ID) and follow its every-6-hours chain forward. Evals from other schedules
// run at a different phase (and often in pairs), so they fall outside the +/-1.5h window and are skipped.
// Pass a different anchor with MONITORING_ANCHOR=<evalId> to monitor another schedule.
//
// PRIVACY — this output is committed and deployed publicly, so it is deliberately content-free:
//   KEPT     check (metric) names + whether each is rule- or judge-graded, counts of passes/failures per
//            check and per failure pattern, latency percentiles, cost, judge token counts, run timestamps.
//   HASHED   chat ids — SHA-256 with a random salt generated per run and then discarded, so ids stay
//            consistent inside one build but cannot be mapped back to real chats.
//   DROPPED  conversation input/output text, assertion bodies/rubrics, judge reasons, eval ids/URLs.
// Do not widen this without checking with whoever owns the data.

import crypto from "crypto";
import fs from "fs";
import path from "path";

const CACHE_DIR = process.argv[2] || process.env.MONITORING_CACHE_DIR || "/tmp/a2e/cache";
const OUT_FILE = path.resolve("src/seed/monitoringFixture.generated.ts");
const ANCHOR_EVAL_ID = process.env.MONITORING_ANCHOR || "eval-ywK-2026-09-18T14:41:53";
const CADENCE_HOURS = 6;
const TOLERANCE_HOURS = 1.5;
const MAX_MISSED_SLOTS = 2; // a run can be missing from the schedule; keep following the chain across it
const SIBLING_WINDOW_MS = 10 * 60_000;
const RECENT_RUNS = 20; // eval runs (about 10 scheduled slots) that keep their failing chat ids

const salt = crypto.randomBytes(16).toString("hex"); // never stored
const hashChat = (chatId) => "c_" + crypto.createHash("sha256").update(salt + String(chatId)).digest("hex").slice(0, 8);
const sha = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const isJudgeType = (type) => /^(llm-rubric|g-eval|model-graded|factuality|moderation|select-best|classifier)/.test(type ?? "");

const numberOrNull = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

const percentile = (values, p) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
};

const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json"));
if (files.length === 0) {
  console.error(`No eval JSON files found in ${CACHE_DIR}`);
  process.exit(1);
}

const runs = [];
const assertionKinds = new Map(); // metric name -> "rule" | "judge"

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), "utf8")).data;
  const results = data.results?.results ?? [];
  if (results.length === 0) continue;

  const asserts = data.config?.defaultTest?.assert ?? results[0].testCase?.assert ?? [];
  for (const a of asserts) {
    if (a.metric && !assertionKinds.has(a.metric)) assertionKinds.set(a.metric, isJudgeType(a.type) ? "judge" : "rule");
  }
  // Two runs belong to the same monitored config when their assertion definitions are identical.
  const configKey = sha([...asserts].sort((x, y) => String(x.metric).localeCompare(String(y.metric))));

  const cases = results
    .slice()
    .sort((a, b) => a.testIdx - b.testIdx)
    .map((r) => {
      const components = r.gradingResult?.componentResults ?? [];
      const failed = components.length
        ? components.filter((c) => !c.pass && c.assertion?.metric).map((c) => c.assertion.metric)
        : Object.entries(r.namedScores ?? {}).filter(([, v]) => v < 1).map(([k]) => k);
      return {
        chat: hashChat(r.metadata?.chatId ?? r.testCase?.metadata?.chatId ?? `${file}:${r.testIdx}`),
        pass: Boolean(r.success),
        failed: [...new Set(failed)].sort(),
        // Production timing/cost live in the transcript-replay metadata. Older runs lack it, and their own
        // latencyMs is the near-instant replay — so "not recorded" is null, never a fake 0.
        latencyMs: numberOrNull(r.metadata?.productionLatencyMs ?? r.testCase?.metadata?.productionLatencyMs),
        cost: numberOrNull(r.metadata?.productionCost ?? r.testCase?.metadata?.productionCost),
      };
    });

  const chatCounts = new Map();
  for (const c of cases) chatCounts.set(c.chat, (chatCounts.get(c.chat) ?? 0) + 1);

  const failedByCheck = {};
  const patternCounts = new Map();
  for (const c of cases) {
    for (const f of c.failed) failedByCheck[f] = (failedByCheck[f] ?? 0) + 1;
    if (!c.pass) {
      const key = c.failed.join("|");
      patternCounts.set(key, { signature: c.failed, count: (patternCounts.get(key)?.count ?? 0) + 1 });
    }
  }

  const gradingTokens = results.reduce(
    (acc, r) => {
      const t = r.gradingResult?.tokensUsed ?? {};
      acc.prompt += t.prompt ?? 0;
      acc.completion += t.completion ?? 0;
      return acc;
    },
    { prompt: 0, completion: 0 },
  );

  const timed = cases.map((c) => c.latencyMs).filter((v) => v != null);
  const costed = cases.filter((c) => c.cost != null);
  runs.push({
    file: file.replace(/\.json$/, ""),
    configKey,
    chats: [...chatCounts.keys()],
    run: {
      startedAt: new Date(data.createdAt).toISOString(),
      n: cases.length,
      passed: cases.filter((c) => c.pass).length,
      uniqueChats: chatCounts.size,
      repeatedChats: [...chatCounts.values()].filter((n) => n > 1).length,
      failedByCheck,
      // A recorded value is > 0; older runs have none, which must not be read as "instant" / "free".
      latency: { p50: percentile(timed, 0.5), p95: percentile(timed, 0.95) },
      timedN: timed.length,
      productionCost: Number(costed.reduce((s, c) => s + c.cost, 0).toFixed(6)),
      costedN: costed.length,
      gradingTokens,
      patterns: [...patternCounts.values()].sort((a, b) => b.count - a.count),
      _failingChats: cases.filter((c) => !c.pass).map((c) => ({ chat: c.chat, failed: c.failed })),
    },
  });
}

// ---- select the monitored schedule: follow the every-6-hours chain from the anchor eval -------------------------
const allRuns = runs.slice().sort((a, b) => a.run.startedAt.localeCompare(b.run.startedAt));
const at = (r) => new Date(r.run.startedAt).getTime();
const anchor = allRuns.find((r) => r.file === ANCHOR_EVAL_ID);
if (!anchor) {
  console.error(`Anchor eval ${ANCHOR_EVAL_ID} not found in ${CACHE_DIR}`);
  process.exit(1);
}
// An eval created within minutes of one with a *different* rubric set belongs to a paired, other-prompt schedule.
const hasForeignSibling = (r) => allRuns.some((x) => x !== r && Math.abs(at(x) - at(r)) <= SIBLING_WINDOW_MS && x.configKey !== r.configKey);
const candidates = allRuns.filter((r) => !hasForeignSibling(r));

const HOUR = 3_600_000;
const chain = [anchor];
for (let cur = anchor; ; ) {
  let next = null;
  for (let k = 1; k <= MAX_MISSED_SLOTS + 1 && !next; k++) {
    const expected = at(cur) + k * CADENCE_HOURS * HOUR;
    const inWindow = candidates.filter((r) => at(r) > at(cur) && Math.abs(at(r) - expected) <= TOLERANCE_HOURS * HOUR);
    next = inWindow.sort((p, q) => Math.abs(at(p) - expected) - Math.abs(at(q) - expected))[0] ?? null;
  }
  if (!next) break;
  chain.push(next);
  cur = next;
}
const sortedRuns = chain;
console.log(`Selected ${chain.length} of ${allRuns.length} evals by following the ${CADENCE_HOURS}h chain from ${ANCHOR_EVAL_ID}.`);

// One monitored eval. Runs with identical check names can still use differently-worded judge rubrics, so
// each distinct rubric set becomes a "judge version", numbered in order of first appearance.
const variantKeys = [...new Set(sortedRuns.map((r) => r.configKey))];
const variants = variantKeys.map((key, i) => ({ id: `v${i + 1}`, label: `Judge set ${i + 1}`, key }));

// Is the same chat graded in more than one eval run?
const seenChats = new Map();
for (const r of sortedRuns) for (const c of r.chats) seenChats.set(c, (seenChats.get(c) ?? 0) + 1);
const crossRun = { graded: seenChats.size, repeated: [...seenChats.values()].filter((n) => n > 1).length };

const fixture = {
  name: "A2E Intake — shared",
  generatedFrom: `${sortedRuns.length} online-eval runs`,
  assertions: [...assertionKinds.entries()].map(([name, kind]) => ({ name, kind })),
  variants: variants.map(({ id, label }) => ({ id, label })),
  runs: sortedRuns.map((r, i) => {
    const { _failingChats, ...run } = r.run;
    const variant = variants.find((v) => v.key === r.configKey).id;
    return i >= sortedRuns.length - RECENT_RUNS ? { ...run, variant, failingChats: _failingChats } : { ...run, variant };
  }),
};

const header =
  `// AUTO-GENERATED by scripts/build-monitoring-fixture.mjs from real Promptfoo online-eval results.\n` +
  `// Do not hand-edit — re-run the script. Content-free by design: no conversation text, chat ids are\n` +
  `// salted hashes (salt discarded), no assertion bodies or judge reasons. See the script header.\n\n` +
  `import type { MonitoringFixture } from "../monitoring";\n\n`;

fs.writeFileSync(OUT_FILE, `${header}export const monitoringFixture: MonitoringFixture = ${JSON.stringify(fixture)};\n`);

const perVariant = variants.map((v) => `${v.label}: ${fixture.runs.filter((r) => r.variant === v.id).length} runs`).join("; ");
console.log(`Wrote ${path.relative(process.cwd(), OUT_FILE)} — ${fixture.runs.length} runs (${perVariant}); ${fixture.assertions.length} checks.`);
console.log(
  `Cross-run check: ${crossRun.repeated} of ${crossRun.graded} distinct chats were graded in more than one run.`,
);
