import { useRef, useState } from "react";
import { FileUp, Upload } from "lucide-react";
import {
  EXPECTED_OUTPUT_TARGET,
  IGNORE_TARGET,
  guessColumnMapping,
  parseCSV,
  parseJSONL,
  type ParsedTable,
} from "../../importDataset";
import { buildDatasetItem } from "../../dataset";
import type { DatasetItem } from "../../types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const PREVIEW_ROWS = 5;

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsText(file);
  });
}

/**
 * "Create from file" — upload a .csv or .jsonl file, map each column to a prompt variable (or
 * expected output, or ignore), preview the first few rows, then import as new Dataset rows.
 */
export function ImportDatasetModal({
  variableNames,
  onImport,
  onClose,
}: {
  variableNames: string[];
  onImport: (items: DatasetItem[], mode: "append" | "replace") => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<string[]>([]);
  const [importMode, setImportMode] = useState<"append" | "replace">("append");

  async function handleFile(file: File) {
    setError(null);
    try {
      const text = await readFileText(file);
      const isJsonl = /\.(jsonl|json)$/i.test(file.name);
      const parsed = isJsonl ? parseJSONL(text) : parseCSV(text);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError("Couldn't find any rows in that file.");
        setTable(null);
        return;
      }
      setFileName(file.name);
      setTable(parsed);
      setMapping(guessColumnMapping(parsed.headers, variableNames));
    } catch {
      setError("Couldn't parse that file — check it's a valid CSV or JSONL.");
      setTable(null);
    }
  }

  function updateMapping(colIndex: number, target: string) {
    setMapping((m) => m.map((v, i) => (i === colIndex ? target : v)));
  }

  const mappedVariableCount = variableNames.filter((v) => mapping.includes(v)).length;
  const canImport = !!table && mappedVariableCount > 0;

  function handleImport() {
    if (!table) return;
    const items = table.rows.map((row) => {
      const values: Record<string, string> = Object.fromEntries(variableNames.map((n) => [n, ""]));
      let expectedOutput = "";
      mapping.forEach((target, colIndex) => {
        const cell = row[colIndex] ?? "";
        if (target === IGNORE_TARGET) return;
        if (target === EXPECTED_OUTPUT_TARGET) {
          expectedOutput = cell;
        } else {
          values[target] = cell;
        }
      });
      return buildDatasetItem(values, variableNames, "case-c", expectedOutput);
    });
    onImport(items, importMode);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent width="lg">
        <DialogHeader>
          <DialogTitle>Create dataset from file</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4 pb-0">
          {!table && (
            <>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                Upload a <code>.csv</code> or <code>.jsonl</code> file. Columns will be matched to this
                prompt's variable{variableNames.length === 1 ? "" : "s"} (
                {variableNames.map((v) => `{${v}}`).join(", ")}) — you can adjust the mapping before importing.
              </div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFile(file);
                }}
                onClick={() => inputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                  dragging ? "border-primary bg-accent" : "border-slate-300 hover:border-ring/60 hover:bg-slate-50"
                }`}
              >
                <Upload size={22} className="text-slate-400" />
                <p className="text-sm text-slate-600">
                  <span className="font-medium text-primary">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-slate-400">CSV or JSONL</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.jsonl,.json,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) handleFile(file);
                  }}
                />
              </div>
              {error && <p className="text-xs text-rose-600">{error}</p>}
            </>
          )}

          {table && (
            <>
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs text-slate-600">
                  <FileUp size={13} /> {fileName} — {table.rows.length} row{table.rows.length === 1 ? "" : "s"} detected
                </p>
                <button
                  onClick={() => {
                    setTable(null);
                    setFileName(null);
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  Choose a different file
                </button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      {table.headers.map((header, i) => (
                        <th key={i} className="border-b border-slate-200 px-2.5 py-2">
                          <div className="mb-1 truncate font-medium text-slate-700" title={header || `Column ${i + 1}`}>
                            {header || `Column ${i + 1}`}
                          </div>
                          <select
                            value={mapping[i] ?? IGNORE_TARGET}
                            onChange={(e) => updateMapping(i, e.target.value)}
                            className="w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-700 outline-none focus:border-ring"
                          >
                            <option value={IGNORE_TARGET}>Ignore column</option>
                            {variableNames.map((v) => (
                              <option key={v} value={v}>
                                {`{${v}}`}
                              </option>
                            ))}
                            <option value={EXPECTED_OUTPUT_TARGET}>Expected output</option>
                          </select>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.slice(0, PREVIEW_ROWS).map((row, ri) => (
                      <tr key={ri} className="odd:bg-white even:bg-slate-50/60">
                        {row.map((cell, ci) => (
                          <td key={ci} className="max-w-[220px] truncate border-t border-slate-100 px-2.5 py-1.5 text-slate-600" title={cell}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {table.rows.length > PREVIEW_ROWS && (
                <p className="text-[11px] text-slate-400">Showing the first {PREVIEW_ROWS} of {table.rows.length} rows.</p>
              )}
              {mappedVariableCount === 0 && (
                <p className="text-xs text-rose-600">Map at least one column to a variable before importing.</p>
              )}

              <div className="flex gap-2 text-xs">
                {(["append", "replace"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setImportMode(m)}
                    className={`rounded-lg border px-2.5 py-1 font-medium transition-colors ${
                      importMode === m
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {m === "append" ? "Append to current rows" : "Replace current rows"}
                  </button>
                ))}
              </div>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {table && (
            <Button variant="default" onClick={handleImport} disabled={!canImport}>
              Import {table.rows.length} row{table.rows.length === 1 ? "" : "s"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
