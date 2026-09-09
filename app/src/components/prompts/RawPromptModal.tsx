import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { promptAsPlainText, promptAsRequestJson, type PromptTemplateSource } from "../../promptTemplate";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type RawTab = "text" | "json";

const TAB_LABEL: Record<RawTab, string> = { text: "Prompt text", json: "Request JSON" };

/**
 * Read-only source view of whatever the structured editor currently holds — the raw prompt text and
 * the provider request body it compiles to. Editing happens in the Playground fields; this is the
 * escape hatch for reading, reviewing and copying the prompt as code.
 */
export function RawPromptModal({
  source,
  title,
  onClose,
}: {
  source: PromptTemplateSource;
  title: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<RawTab>("text");
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => promptAsPlainText(source.messages), [source.messages]);
  const json = useMemo(() => promptAsRequestJson(source), [source]);
  const shown = tab === "text" ? text : json;

  function handleCopy() {
    navigator.clipboard
      .writeText(shown)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent width="xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                {(Object.keys(TAB_LABEL) as RawTab[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      tab === t ? "bg-primary text-primary-foreground" : "text-slate-600 hover:text-slate-800"
                    }`}
                  >
                    {TAB_LABEL[t]}
                  </button>
                ))}
              </div>
              <Button size="sm" onClick={handleCopy}>
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
              </Button>
            </div>

            <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-100 p-3 font-mono text-xs leading-relaxed text-slate-800">
              {shown || "(empty prompt)"}
            </pre>

            <p className="text-[11px] text-slate-400">
              {tab === "text"
                ? "Shown as authored — {variables} are left as placeholders rather than filled in."
                : "Same body the server sends to the provider. Tool and schema JSON that doesn't parse is shown verbatim."}
            </p>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
