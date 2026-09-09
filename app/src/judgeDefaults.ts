/**
 * Shared between the client (EvalPane, as placeholder/preview text) and the server
 * (`server/openai.ts`, as the actual fallback) so both sides agree on what "default" means
 * when a Judge Policy doesn't override the grading instructions or temperature.
 */
export const DEFAULT_JUDGE_SYSTEM_PROMPT =
  "You are a strict, calibrated grader for an LLM output. You will be given a rubric, the " +
  "original input, and the model's output. Decide pass or fail against the rubric only — do not " +
  "invent additional criteria. Also give a continuous score from 0 to 1 reflecting how well the " +
  "output satisfies the rubric (1 = fully satisfies, 0 = completely fails) — this can differ in " +
  "nuance from the boolean pass/fail (e.g. a borderline output might score 0.4 and still fail). " +
  'Respond as JSON: {"passed": true|false, "score": 0-1, "reason": "one sentence"}.';

export const DEFAULT_JUDGE_TEMPERATURE = 0;
