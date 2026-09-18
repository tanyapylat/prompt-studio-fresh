import fs from "fs";
import { parseCsv, parseProviderHeader } from "./csv-lib.mjs";

const files = [
  "eval-hbw-2026-08-16T18_05_07.csv",
  "one prompt a lot of assertions.csv",
  "Scenario one prompt and more than one input.csv",
  "Scenario-three prompts.csv",
  "scenario one prompt and few inputs.csv",
  "scenario one prompt with ref output.csv",
  "scenario one prompt with ref output #2.csv",
];

for (const f of files) {
  const p = "C:/Users/Veronica.Kravets/Downloads/" + f;
  const txt = fs.readFileSync(p, "utf8");
  const rows = parseCsv(txt);
  const header = rows[0];
  const dataRows = rows.slice(1).filter((r) => r.length > 1 || (r[0] ?? "").trim() !== "");

  // Find provider-group start indices.
  const groupStarts = [];
  header.forEach((cell, idx) => {
    if (parseProviderHeader(cell)) groupStarts.push(idx);
  });

  console.log("=== " + f + " ===");
  console.log("columns:", header.length, "| data rows:", dataRows.length, "| provider groups:", groupStarts.length);
  console.log("vars (before first group):", header.slice(0, groupStarts[0] ?? header.length));
  groupStarts.forEach((start, gi) => {
    const end = groupStarts[gi + 1] ?? header.length;
    const groupHeader = header.slice(start, end);
    const meta = parseProviderHeader(header[start]);
    console.log(`  group ${gi}: cols[${start}:${end}] promptId=${meta?.promptId} versionId=${meta?.versionId}`);
    console.log("    fields:", groupHeader);
  });
  console.log();
}
