/** Triggers a client-side file download for a string payload — no server round-trip. */
export function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** RFC 4180-ish CSV cell escaping — wraps in quotes whenever the value needs it, doubles internal quotes. */
export function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

/** e.g. "2026-09-02T18-40-00" — safe to embed directly in a filename on every OS. */
export function timestampForFilename(date = new Date()): string {
  return date.toISOString().replace(/:/g, "-").replace(/\..+/, "");
}
