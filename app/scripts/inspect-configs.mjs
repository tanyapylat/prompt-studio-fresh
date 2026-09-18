// Ad-hoc analysis of the Prompt Management "configs" DB export (semicolon-delimited, one row per
// promptId+eval-config+eval-run, with the *actual* Promptfoo-style config as a JSON string in
// `EvalConfigurationJson`) — used once to sanity-check whether our seeded demo scenarios' assertion
// types/shapes are representative of what's really used in production. Not part of the app build;
// re-run with `node scripts/inspect-configs.mjs <path-to-csv>` if a fresh export needs re-checking.
import fs from "fs";
import { parseCsv } from "./csv-lib.mjs";

const FILE = process.argv[2] ?? "C:/Users/Veronica.Kravets/Downloads/configs-new-2026-6-24.csv";
const txt = fs.readFileSync(FILE, "utf8");
const rows = parseCsv(txt, ";");
const header = rows[0];
const dataRows = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ""));
const col = (name) => header.indexOf(name);
const idx = { PromptName: col("PromptName"), EvalConfigurationJson: col("EvalConfigurationJson") };

console.log("header (", header.length, "cols)");
console.log("data rows:", dataRows.length, "| unique PromptName:", new Set(dataRows.map((r) => r[idx.PromptName])).size);

const assertionTypeCounts = new Map();
const providerTypeCounts = new Map();
const sampleByType = new Map();
let parsedOk = 0;
let parseFailed = 0;
let withMultiProviders = 0;
let withDefaultTestAssert = 0;
let withPerTestAssert = 0;
let withBoth = 0;

function collectAsserts(assertArr) {
  if (!Array.isArray(assertArr)) return;
  for (const a of assertArr) {
    if (!a || typeof a !== "object") continue;
    const t = a.type ?? "(no type)";
    assertionTypeCounts.set(t, (assertionTypeCounts.get(t) ?? 0) + 1);
    if (!sampleByType.has(t)) sampleByType.set(t, JSON.stringify(a).slice(0, 300));
  }
}

for (const r of dataRows) {
  const raw = r[idx.EvalConfigurationJson];
  if (!raw?.trim()) continue;
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch {
    parseFailed++;
    continue;
  }
  parsedOk++;

  if (Array.isArray(cfg.providers)) {
    if (cfg.providers.length > 1) withMultiProviders++;
    for (const p of cfg.providers) {
      const key = typeof p === "string" ? p : p?.id ?? "(object provider, no id)";
      providerTypeCounts.set(key, (providerTypeCounts.get(key) ?? 0) + 1);
    }
  }

  if (cfg.defaultTest?.assert) {
    withDefaultTestAssert++;
    collectAsserts(cfg.defaultTest.assert);
  }
  let testsWithAssert = 0;
  if (Array.isArray(cfg.tests)) {
    for (const t of cfg.tests) {
      if (t?.assert) {
        testsWithAssert++;
        collectAsserts(t.assert);
      }
    }
  }
  if (testsWithAssert > 0) withPerTestAssert++;
  if (testsWithAssert > 0 && cfg.defaultTest?.assert) withBoth++;
}

console.log("\nParsed OK:", parsedOk, "| Parse failed (truncated field, not a bug — see below):", parseFailed);
console.log("withDefaultTestAssert (one fixed assertion set for the whole dataset):", withDefaultTestAssert);
console.log("withPerTestAssert (assertions vary per row):", withPerTestAssert, "| both:", withBoth);
console.log("withMultiProviders (prompt-comparison runs):", withMultiProviders);

console.log("\n=== Assertion type frequency ===");
for (const [t, c] of [...assertionTypeCounts.entries()].sort((a, b) => b[1] - a[1])) console.log(String(c).padStart(6), t);

console.log("\n=== Provider id frequency (top 20) ===");
for (const [t, c] of [...providerTypeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(String(c).padStart(6), t);

console.log("\n=== One sample per assertion type ===");
for (const [t, s] of sampleByType) console.log(`\n${t}:\n  ${s}`);
