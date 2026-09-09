# AI Studio — prototype

A click-through prototype of the spec-driven workflow described in
[`../spec-driven-redesign/`](../spec-driven-redesign/README.md), backed by **real OpenAI calls**
when configured, with an automatic offline fallback when it isn't.

## Run it

```bash
npm install
npm run dev
```

Then open the printed `http://localhost:5173/` URL. It works immediately with **no setup** —
Generate/Run fall back to a deterministic offline simulation with no API key required.

## Enable real generation (optional)

```bash
cp .env.example .env
# then edit .env and set OPENAI_API_KEY=sk-...
```

Restart `npm run dev` after adding the key. With it set:
- **Generate** drafts the actual system prompt and synthetic dataset rows via `gpt-4o-mini`.
- **Run** calls the Target's own model/temperature for every dataset row and, for any
  `rubric_grading` assertion, calls an LLM-as-judge to grade the real output.

The key is read **only on the Vite dev server's Node process** (via a small dev-middleware
plugin in `server/`) and is never sent to the browser bundle — `app/.env` is git-ignored.
Simulated mode is called out wherever it's active (Workspace top bar, Playground "Try it" panel,
Results pane); a configured, working key is the normal state and isn't specially flagged.

## Architecture

```
app/
  src/            Client — React UI, in-memory store, pure classification/scoring logic
  server/         Dev-server-only — the /api/generate and /api/run handlers that call OpenAI
```

- `src/engine.ts` — the deterministic, free parts of "generate": criterion → assertion
  classification (cheapest-tier-first: literal contains/excludes/enum/valid-JSON checks before
  falling back to an LLM-judge rubric), structural checks derived from the Output contract, and
  real scoring of `deterministic` checks (promptfoo-parity catalog, see `src/assertionCatalog.ts`)
  and `custom_code` checks (real JS execution, Python stored-but-not-run) against actual output text.
- `server/openai.ts` — the four LLM calls: draft the prompt from the Spec, generate synthetic
  dataset rows, run the Target against one input, and LLM-as-judge grading.
- `server/apiPlugin.ts` — a Vite `configureServer` middleware exposing `POST /api/generate`,
  `POST /api/run`, and `GET /api/health`; falls back to the offline simulation in `engine.ts`
  automatically whenever `OPENAI_API_KEY` isn't configured.
- `src/api.ts` / `src/specFactory.ts` / `src/lifecycle.ts` — client-side async wrappers that call
  those endpoints and merge the result back into the in-memory Spec.

## What's implemented

- **Spec editor** — goal, context, typed input/output contracts, flat requirements, examples with rationale, open questions, all inline-editable.
- **Coverage checklist** — every guardrail/criterion shows live whether an Assertion currently covers it.
- **Generate** — drafts a Prompt, Assertions, a Judge Policy (only if needed), and a Dataset from
  the Spec. Real LLM calls when `OPENAI_API_KEY` is set; deterministic simulation otherwise — either
  way it always completes.
- **Iterate** — edit the Prompt, Assertions, or Dataset directly; editing the Prompt content mints
  a fresh draft version (forking a Spec back to draft, since a Spec's published state is just
  whether its current Prompt version is published — see below). Editing Assertions/Dataset has no
  publish-state effect, since "published" doesn't exist at that level.
- **Configurable Judge Policy** — model, temperature, and the grading system prompt are all
  editable per Spec (and round-trip through the Judge Policy Library), instead of a fixed
  `gpt-4o-mini` stamp.
- **Assertion grouping and passing thresholds** — assertions can be organized into free-text
  groups (e.g. "Guardrails"), and each assertion can set its own required pass rate or fall back
  to the Spec's default; the Results pane rolls up actual vs. required pass rate per assertion,
  grouped the same way.
- **Published, at exactly two levels** — a **Prompt version** (in the Playground) and the **Spec**
  itself, which counts as published exactly when its current Prompt/Target version is published.
  Nothing else (Assertions, Dataset, Eval) carries its own publish state.
- **Publish** — in a Spec's Workspace, one action that publishes the current Target and
  auto-triggers a run. Standalone Prompts (not linked to a Spec) publish independently from the
  Prompt Playground.
- **Review** — an AI-agent first-pass (coverage gaps, threshold misses, 100%-pass-rate warning)
  plus a simple comment thread and Approve / Request changes verdicts.
- **Results / error analysis** — a pass-rate-by-assertion rollup, failing rows sorted first,
  per-assertion reasons, a Live/Simulated badge per run, a Sample-run badge when applicable, and an
  open-coding note field per row.

See [`../requirements/`](../requirements/README.md) for the full, granular requirement blocks
this app implements (and the ones it deliberately doesn't yet).

## Known simplifications (this is deliberately not the full data model)

- No separate version-history tables — Assertions/Dataset/Eval are single mutable records with no
  publish state of their own; only a Prompt version (and, derived from it, the Spec) carries a
  `draft`/`published` status.
- "Regenerate" fully overwrites the current draft bundle — there's no diff-driven delta
  regeneration (Case B in the docs) yet.
- No multi-target comparison (Case A/B side-by-side runs) — only one Target per Spec.
- No judge calibration step — a `rubric_grading` assertion's Judge Policy is a model/temperature/
  grading-prompt choice, but validating it against human-labeled agreement is out of scope until
  there's a real labeling UI (a separate, larger piece of work).
- Passing thresholds are informational only — they don't gate Publish or change a run's overall
  pass rate, and the offline/simulated run path ignores a Judge Policy's `temperature`/
  `systemPrompt` overrides (only the live `/api/run` path actually uses them).
- No persistence — state lives in memory and resets on page refresh; the three seed Specs in
  `src/seed.ts` are hand-authored fixtures (not generated at load time) so the app looks populated
  immediately without an API key or network call.
