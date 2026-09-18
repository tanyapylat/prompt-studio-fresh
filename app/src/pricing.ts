import { seededRandom } from "./utils/random";

/**
 * Rough, publicly-listed per-token pricing for the Playground's four model choices — good enough
 * to show a directionally-correct cost after a run, not a billing-grade source of truth. Unknown
 * models fall back to the `gpt-4o-mini` row rather than throwing.
 */
export interface ModelPricing {
  /** USD per 1M input (prompt) tokens. */
  inputPer1M: number;
  /** USD per 1M output (completion) tokens. */
  outputPer1M: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10 },
  "claude-3-7-sonnet": { inputPer1M: 3, outputPer1M: 15 },
  "gemini-1.5-pro": { inputPer1M: 1.25, outputPer1M: 5 },
};

const FALLBACK_PRICING: ModelPricing = MODEL_PRICING["gpt-4o-mini"];

export function pricingFor(model: string): ModelPricing {
  return MODEL_PRICING[model] ?? FALLBACK_PRICING;
}

export function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = pricingFor(model);
  return (promptTokens / 1_000_000) * pricing.inputPer1M + (completionTokens / 1_000_000) * pricing.outputPer1M;
}

/** ~4 chars/token heuristic — used only when there's no real `usage` object to report (offline mode). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.round(text.length / 4));
}

/**
 * Same "directionally correct, not billing-grade" latency/cost/token simulation the live simulate
 * path in `engine.ts` runs after a real generation call — used by every seeded demo Run (hand-
 * authored Specs and the CSV-imported scenario fixtures alike) so latency/cost/tokenUsage are
 * never silently `undefined` (which used to make the Results/RunSummary aggregates disappear for
 * anything that wasn't a live run).
 */
export function simulatedPerf(
  itemId: string,
  promptText: string,
  outputText: string,
  model: string,
): { latencyMs: number; costUsd: number; tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } } {
  const promptTokens = estimateTokens(promptText);
  const completionTokens = estimateTokens(outputText);
  const costUsd = estimateCostUsd(model, promptTokens, completionTokens);
  const latencyMs = Math.round(350 + seededRandom(`${itemId}:latency`) * 2400);
  return { latencyMs, costUsd, tokenUsage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens } };
}
