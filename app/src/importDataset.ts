/** Column-mapping target: a variable name to fill, the per-row expected output, or skip entirely. */
export type ColumnTarget = string;
export const EXPECTED_OUTPUT_TARGET = "__expectedOutput__";
export const IGNORE_TARGET = "__ignore__";

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

/** RFC4180-ish CSV parser: quoted fields, escaped `""`, commas/newlines inside quotes, CRLF or LF. */
export function parseCSV(text: string): ParsedTable {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const source = text.replace(/^\uFEFF/, "");

  function pushField() {
    row.push(field);
    field = "";
  }
  function pushRow() {
    pushField();
    rows.push(row);
    row = [];
  }

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch === "\r") {
      // swallow, \n (if present) handles the row break
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();

  const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
  const [headers, ...dataRows] = nonEmpty;
  return { headers: headers ?? [], rows: dataRows };
}

/**
 * Each line is a JSON object whose keys become columns (union across all lines, first-seen
 * order). A line that's just a bare string is treated as `{ input: "<that string>" }` so plain
 * one-value-per-line JSONL files (no object wrapper) still work.
 */
export function parseJSONL(text: string): ParsedTable {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const headerOrder: string[] = [];
  const seen = new Set<string>();
  const records: Record<string, string>[] = [];

  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    let record: Record<string, string>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      record = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        record[k] = typeof v === "string" ? v : JSON.stringify(v);
      }
    } else {
      record = { input: typeof parsed === "string" ? parsed : JSON.stringify(parsed) };
    }
    for (const key of Object.keys(record)) {
      if (!seen.has(key)) {
        seen.add(key);
        headerOrder.push(key);
      }
    }
    records.push(record);
  }

  return {
    headers: headerOrder,
    rows: records.map((r) => headerOrder.map((h) => r[h] ?? "")),
  };
}

function normalizeHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

const OUTPUT_ALIASES = new Set(["output", "expectedoutput", "expected", "answer", "response", "label", "target"]);

/**
 * Best-effort default mapping so the common cases (a column literally named after a variable, or
 * an "output"/"expected"-ish column) need zero manual work — anything left over is assigned to
 * remaining variables positionally, left-to-right, so a plain "one column per variable, in order"
 * file also just works without matching header names at all.
 */
export function guessColumnMapping(headers: string[], variableNames: string[]): ColumnTarget[] {
  const used = new Set<string>();
  const mapping: ColumnTarget[] = headers.map((header) => {
    const norm = normalizeHeader(header);
    if (!norm) return IGNORE_TARGET;
    const varMatch = variableNames.find(
      (v) => !used.has(v) && (norm === normalizeHeader(v) || norm.includes(normalizeHeader(v)) || normalizeHeader(v).includes(norm)),
    );
    if (varMatch) {
      used.add(varMatch);
      return varMatch;
    }
    if (OUTPUT_ALIASES.has(norm)) return EXPECTED_OUTPUT_TARGET;
    return IGNORE_TARGET;
  });

  const remaining = variableNames.filter((v) => !used.has(v));
  let idx = 0;
  for (let i = 0; i < mapping.length && idx < remaining.length; i++) {
    if (mapping[i] === IGNORE_TARGET) {
      mapping[i] = remaining[idx];
      used.add(remaining[idx]);
      idx++;
    }
  }
  return mapping;
}
