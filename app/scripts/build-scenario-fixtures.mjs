import fs from "fs";
import path from "path";
import { parseCsv, parseProviderHeader } from "./csv-lib.mjs";

const DOWNLOADS = "C:/Users/Veronica.Kravets/Downloads";
const OUT_FILE = path.resolve("src/seed/scenarioFixtures.generated.ts");

/**
 * One config entry per source CSV — column roles were determined by inspecting each file's header
 * with `inspect-csv.mjs` (see the parent conversation for the raw dump). `varCols` order becomes
 * the dataset's variable order everywhere downstream.
 */
const FILES = [
  {
    key: "evalHbw",
    file: "eval-hbw-2026-08-16T18_05_07.csv",
    descriptionCol: 0,
    varCols: [{ name: "Conversation", idx: 1 }],
    referenceCol: 2,
    groupStartCols: [3],
    maxRows: 100,
  },
  {
    key: "lotOfAssertions",
    file: "one prompt a lot of assertions.csv",
    descriptionCol: null,
    varCols: [
      { name: "rl_dynamic_section", idx: 0 },
      { name: "Pearl_User_Chat", idx: 1 },
      { name: "expert", idx: 2 },
    ],
    referenceCol: null,
    groupStartCols: [3],
    maxRows: 100,
  },
  {
    key: "moreThanOneInput",
    file: "Scenario one prompt and more than one input.csv",
    descriptionCol: 0,
    varCols: [
      { name: "expert_for_prompt", idx: 1 },
      { name: "ppc", idx: 2 },
      { name: "based_on_ppc", idx: 3 },
      { name: "ppckeyword", idx: 4 },
      { name: "problem_subject_name", idx: 5 },
      { name: "problem_subject_goals", idx: 6 },
      { name: "messages_array", idx: 7 },
    ],
    referenceCol: null,
    groupStartCols: [8],
    maxRows: 50,
  },
  {
    key: "threePrompts",
    file: "Scenario-three prompts.csv",
    descriptionCol: 0,
    varCols: [
      { name: "expert_for_prompt", idx: 1 },
      { name: "problem_subject_name", idx: 2 },
      { name: "problem_subject_goals", idx: 3 },
      { name: "messages_array", idx: 4 },
      { name: "ppc", idx: 5 },
      { name: "based_on_ppc", idx: 6 },
    ],
    referenceCol: null,
    groupStartCols: [7, 28, 49],
    maxRows: 100,
  },
  {
    key: "fewInputs",
    file: "scenario one prompt and few inputs.csv",
    descriptionCol: null,
    varCols: [
      { name: "name_info", idx: 0 },
      { name: "location_info", idx: 1 },
      { name: "pet_example", idx: 2 },
      { name: "user_message", idx: 3 },
    ],
    referenceCol: null,
    groupStartCols: [4],
    maxRows: 30,
  },
  {
    key: "refOutput1",
    file: "scenario one prompt with ref output.csv",
    descriptionCol: null,
    varCols: [{ name: "Conversation", idx: 0 }],
    referenceCol: 1,
    groupStartCols: [2],
    maxRows: 25,
  },
  {
    key: "refOutput2",
    file: "scenario one prompt with ref output #2.csv",
    descriptionCol: 0,
    varCols: [{ name: "Chat", idx: 2 }],
    referenceCol: 1,
    groupStartCols: [3],
    maxRows: 20,
  },
];

function groupWidth(header, start, allStarts) {
  const idx = allStarts.indexOf(start);
  const next = allStarts[idx + 1] ?? header.length;
  return next - start;
}

function buildFixture(cfg) {
  const p = path.join(DOWNLOADS, cfg.file);
  const txt = fs.readFileSync(p, "utf8");
  const rows = parseCsv(txt);
  const header = rows[0];
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ""));

  const variantMeta = cfg.groupStartCols.map((start) => {
    const meta = parseProviderHeader(header[start]);
    return { promptId: meta.promptId, versionId: meta.versionId };
  });

  // Metric names for each group (assumed identical across groups — true for every file here).
  const width0 = groupWidth(header, cfg.groupStartCols[0], cfg.groupStartCols);
  const metricCount = width0 - 6; // output, status, score, namedScores, ..metrics.., graderReason, comment
  const assertionNames =
    metricCount > 0
      ? header.slice(cfg.groupStartCols[0] + 4, cfg.groupStartCols[0] + 4 + metricCount).map((h) => h.replace(/^Metric:\s*/, ""))
      : [];

  const statusValuesSeen = new Set();

  const outRows = dataRows.slice(0, cfg.maxRows).map((r) => {
    const description = cfg.descriptionCol !== null ? r[cfg.descriptionCol] : undefined;
    const vars = cfg.varCols.map((v) => r[v.idx] ?? "");
    const reference = cfg.referenceCol !== null ? r[cfg.referenceCol] : undefined;

    const variants = cfg.groupStartCols.map((start) => {
      const output = r[start] ?? "";
      const status = (r[start + 1] ?? "").trim();
      statusValuesSeen.add(status);
      const scoreRaw = (r[start + 2] ?? "").trim();
      const score = scoreRaw === "" ? null : Number(scoreRaw);
      const metricScores =
        metricCount > 0
          ? Array.from({ length: metricCount }, (_, mi) => {
              const raw = (r[start + 4 + mi] ?? "").trim();
              return raw === "" ? null : Number(raw);
            })
          : [];
      const graderReason = r[start + 4 + metricCount] ?? "";
      return { output, status, score, metricScores, graderReason };
    });

    return { description, vars, reference, variants };
  });

  return {
    key: cfg.key,
    varNames: cfg.varCols.map((v) => v.name),
    assertionNames,
    variantMeta,
    rows: outRows,
    statusValuesSeen: [...statusValuesSeen],
  };
}

const fixtures = FILES.map(buildFixture);

for (const f of fixtures) {
  console.log(f.key, "-> rows:", f.rows.length, "| assertions:", f.assertionNames.length, "| statuses seen:", f.statusValuesSeen);
}

const banner = `// AUTO-GENERATED by scripts/build-scenario-fixtures.mjs from real Promptfoo CSV exports.
// Do not hand-edit — re-run the script if the source files or column mapping change.
// Content only (no ids/timestamps) — scenarioSeeds.ts turns this into real SpecProject/RunGroup data.
`;

const body = fixtures
  .map((f) => `export const ${f.key}Fixture = ${JSON.stringify({ varNames: f.varNames, assertionNames: f.assertionNames, variantMeta: f.variantMeta, rows: f.rows }, null, 2)} as const;\n`)
  .join("\n");

fs.writeFileSync(OUT_FILE, banner + "\n" + body);
console.log("\nWrote", OUT_FILE, `(${(fs.statSync(OUT_FILE).size / 1024).toFixed(0)} KB)`);
