/** All / Public / Private — the one privacy pill shared by Specs, Prompts, Assertions, and Datasets. */
export type PrivacyFilterValue = "all" | "org" | "mine";

const OPTIONS: PrivacyFilterValue[] = ["all", "org", "mine"];

export function PrivacyFilter({
  value,
  onChange,
}: {
  value: PrivacyFilterValue;
  onChange: (value: PrivacyFilterValue) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {OPTIONS.map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            value === f ? "bg-primary text-primary-foreground" : "text-slate-600 hover:text-slate-800"
          }`}
        >
          {f === "all" ? "All" : f === "mine" ? "Private" : "Public"}
        </button>
      ))}
    </div>
  );
}
