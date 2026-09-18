import { PencilLine, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DatasetItemSource } from "../../types";
import { DATASET_SOURCE_LABEL, DATASET_SOURCE_TONE } from "../../dataset";

// Sparkles for AI-generated rows is the same significator Prompt Studio uses for its "generated"
// marker; manual (typed/imported) rows get a plain pencil instead of PS's "no icon at all", since
// every row here still needs a visible, filterable value for `source`.
const DATASET_SOURCE_ICON: Record<DatasetItemSource, LucideIcon> = {
  synthetic: Sparkles,
  manual: PencilLine,
};

const TONE_TEXT_CLASS: Record<"neutral" | "info" | "accent", string> = {
  neutral: "text-slate-500",
  info: "text-sky-600",
  accent: "text-violet-600",
};

/**
 * Icon-only significator for a Dataset row's `source` (synthetic/manual — the same two-way split
 * Prompt Studio uses) — swapped in for the old text `Badge` everywhere this shows up (Dataset
 * table, Results table, both detail panels) so a dense row of results reads as icons at a glance
 * instead of a wall of repeated "Synthetic"/"Manual" text; the full label is still one hover away
 * via `title`.
 */
export function DatasetSourceIcon({
  source,
  size = 13,
  className = "",
}: {
  source: DatasetItemSource;
  size?: number;
  className?: string;
}) {
  const Icon = DATASET_SOURCE_ICON[source];
  return (
    <span
      title={DATASET_SOURCE_LABEL[source]}
      className={`inline-flex shrink-0 items-center ${TONE_TEXT_CLASS[DATASET_SOURCE_TONE[source]]} ${className}`}
    >
      <Icon size={size} />
    </span>
  );
}
