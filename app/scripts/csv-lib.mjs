// Minimal RFC4180-ish CSV parser — handles quoted fields, doubled-quote escapes, and embedded
// newlines inside quoted fields (all present in the real Promptfoo exports we're importing).
// No dependency needed for a one-time import script.
export function parseCsv(text, delimiter = ",") {
  // Some exports (e.g. the Prompt Management config dump) use `;` instead of `,` — everything else
  // about the format (quoting, doubled-quote escapes, embedded newlines) is identical.
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  // Strip a leading UTF-8 BOM, if present (seen on the semicolon-delimited exports).
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const len = text.length;
  while (i < len) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === delimiter) {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // trailing field/row without a final newline
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Parses a `[url] {"promptId":N,"versionId":M}` provider-group header cell — returns null if it doesn't match. */
export function parseProviderHeader(cell) {
  const m = cell.match(/^\[(.*?)\]\s*(\{.*\})$/s);
  if (!m) return null;
  try {
    const meta = JSON.parse(m[2]);
    return { url: m[1], promptId: meta.promptId, versionId: meta.versionId };
  } catch {
    return null;
  }
}
