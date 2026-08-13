# Eval Methodology: Applying Current Best Practice (Hamel Husain / Shreya Shankar) to This Design

The rest of this proposal describes a **mechanism**: Spec → generate Prompt/Assertions/Dataset → dry run → publish → citable run → online eval. This doc grounds that mechanism in the **methodology** that the field has converged on for actually getting evals right — primarily Hamel Husain's and Shreya Shankar's writing and teaching (the ["LLM Evals FAQ"](https://hamel.dev/blog/posts/evals-faq/), the *AI Evals for Engineers & PMs* course, and *A Field Guide to Rapidly Improving AI Products*). Their guidance was assembled from 700+ practitioners and is the most current, field-tested reference available as of mid-2026.

**The one thing worth being explicit about up front:** their single strongest, most repeated warning is *against* the exact thing a naive reading of "spec-driven" could become — writing evaluators before you have real failure data ("eval-driven development"). This doc exists to reconcile that warning with spec-driven generation, not to ignore it.

## The core warning: don't practice eval-driven development by default

> "Should I practice eval-driven development? Generally no... Unlike traditional software where failure modes are predictable, LLMs have infinite surface area for potential failures. You can't anticipate what will break. A better approach is to start with error analysis. Write evaluators for errors you discover, not errors you imagine." — Hamel Husain

**Exception, explicitly stated:** "Eval-driven development may work for specific constraints where you know exactly what success looks like." A guardrail like "never mention a competitor" is a legitimate case for writing the check before you have failure data.

### How this reshapes the Spec → dry-run flow

A Spec's success criteria and guardrails are usually closer to that exception than to "imagined failures" — they're stated product/business constraints (input contract, output contract, explicit must-not-do rules), not guesses about how the model might fail. So it's reasonable for a dry run to auto-generate assertions from them. But two things need to change from a purely mechanical reading of [02](02-workflow-starting-anew.md)/[03](03-workflow-new-version-from-existing.md):

1. **Spec-derived assertions are hypotheses, not committed evaluators, until validated.** Treat every auto-generated `AssertionVersion` as **draft and provisional**. It earns "trusted" status the same way any evaluator does in this methodology: by being checked against real failure data (see judge calibration below), not by having been present at generation time.
2. **The primary way an Eval actually gets *good* is error analysis on real traces, not the initial spec-derived generation.** The dry run gets a prompt+eval+dataset bundle to a *runnable* state fast. Error analysis — reading real dry-run outputs, batch-run outputs, and (once live) production traces — is what makes that bundle *correct*. This is why [03](03-workflow-new-version-from-existing.md)'s "Case C" (eval/dataset evolves from a discovered gap) is not a secondary edge case — it is the main engine of eval quality, and the product should treat it that way (see "Elevating error analysis to a first-class surface" below).

## The cost hierarchy — apply it to how assertions get generated and typed

> "Fix your prompt, then use the cheapest eval that does the job." — Hamel Husain

When a dry run drafts assertions from Spec criteria (or when a user manually adds one), apply this order, cheapest first:

1. **Is this actually a missing instruction, not a missing check?** Before generating a `rubric_grading` assertion for a criterion like "responses should be concise," the system should surface: *"this looks like a prompt instruction, not a check — add 'keep responses under 3 sentences' to the prompt instead?"* Many "failures" are unspecified preferences, not things that need a judge.
2. **Prefer `code_assertion` wherever the criterion is checkable deterministically** — output contains/excludes a string, matches a JSON schema, a field is within bounds, a tool was/wasn't called. Cheap to run, cheap to maintain, zero calibration burden.
3. **Reserve `rubric_grading` (LLM-as-judge) for criteria that are genuinely subjective and will need repeated iteration** — tone, persona consistency, nuanced correctness. This is the expensive tier: it needs a labeled validation set and ongoing maintenance (see below), so it should be a deliberate choice, not the default output of every success-criterion bullet.

**Recommendation for the dry-run generator:** when drafting assertions from a Spec, tag each suggestion with its tier (`prompt-fix` / `code_assertion` / `rubric_grading`) and default to the cheapest tier that plausibly covers the criterion. Let the user upgrade a suggestion to `rubric_grading` explicitly rather than defaulting there.

**Important refinement from the *Eval Service SDD* (see [06-sdd-alignment-and-resolutions.md](06-sdd-alignment-and-resolutions.md)):** "cheap" and "safe" aren't the same axis for `code_assertion`. The SDD's security section flags that a code assertion runs as real JavaScript on the runner, with the runner's own permissions, and v1 ships **no** sandboxing or review gate around that content. So step 2 above isn't "let the generator write arbitrary JS by default" — per the resolved approach in [02](02-workflow-starting-anew.md) step 2, it means: (1) map the criterion onto an existing, parameterized type in the **promptfoo assertions library** first (contains/excludes, regex, valid JSON, JSON-schema, field-in-range, tool-called); (2) only if nothing fits, let the generator write a small custom check itself, flagged for the AI review agent rather than trusted silently; (3) a check too novel or risky even for that becomes a request to an engineer to add a new curated type. A criterion that fits none of the code tiers drops to `rubric_grading`.

## Binary pass/fail, not 1-5 scales

> "Start with binary labels to understand what 'bad' looks like. Numeric labels are advanced and usually not necessary." — Hamel Husain

The data model already agrees with this by construction: `Score.Passed` is the verdict that matters (`Score.Score` is the raw 0-1 the engine returns, but the pass/fail threshold — Gate 1 in the data model's three-gate scoring section — is what should drive decisions). The recommendation this adds is a **UI/authoring** one: when a Spec criterion is naturally graded ("rate helpfulness 1-5"), push the author toward decomposing it into several **binary** sub-checks instead ("cites a source," "answers the literal question asked," "under 200 words") rather than a single Likert-style `rubric_grading` assertion. Binary checks are faster to label, faster to align a judge against, and don't let annotators hide uncertainty in a middle value.

## No generic, off-the-shelf metrics

> "The abuse of generic metrics is endemic... Instead, conduct error analysis to understand failures. Define binary failure modes based on real problems." — Hamel Husain

The Eval Library (see [04](04-cross-cutting-ux-and-open-questions.md)) should **not** ship with a starter pack of generic assertions like "helpfulness," "coherence," or "quality" as if they were meaningful defaults. If the library needs seed content, seed it with **mechanism-level** reusable checks (schema validation, PII/profanity detection, refusal-calibration pattern) rather than vague quality scores — the same distinction the data model draws between `code_assertion` and `rubric_grading`, applied to what the library recommends by default.

## Judge calibration: recommended practice, not a publish gate

Current best practice treats this as important:

> "Focus on achieving high True Positive Rate (TPR) and True Negative Rate (TNR) with your judge on a held-out labeled test set... Skip this validation and your judges may not reflect your actual quality criteria." — Hamel Husain

This doc originally recommended a **hard publish gate**: no `JudgePolicyVersion` backing a `rubric_grading` Assertion could be published until it cleared a calibration pass against human labels. **Per team decision (see [02](02-workflow-starting-anew.md) step 6), that hard gate has been dropped** — Publish no longer blocks on it. The reasoning below still stands as recommended, optional practice for anyone who wants real confidence in a judge before trusting its verdicts, kept here as guidance rather than enforcement:

1. The domain expert (see "benevolent dictator," below) hand-labels pass/fail on a sample of dataset items/dry-run outputs for that specific assertion — the data model's `DatasetItemAssertion` mechanism is a natural home for these golden labels.
2. Run the draft judge against the same items; compute agreement (TPR/TNR, or simple accuracy for a first pass).
3. Iterate on the rubric (`JudgePolicyVersion.RubricPrompt`) until agreement is acceptable — this is expected to take a few rounds, so keep the judge in **draft** through this process (draft versions are freely editable, per the data model's Foundations section).
4. A judge that's been through this loop and shows good agreement can be trusted as real *evidence*, not just *a number* — but skipping it doesn't block anything downstream.

A judge that hasn't been through this loop can still be visibly flagged in the UI (e.g., "uncalibrated judge") anywhere its scores are shown, so nobody mistakes an unvalidated `rubric_grading` score for ground truth — a useful, low-cost signal even without a hard gate behind it.

## The "benevolent dictator": who owns quality judgment

> "For most small to medium-sized companies, appointing a single domain expert as a 'benevolent dictator' is the most effective approach... A single expert eliminates annotation conflicts and prevents the paralysis that comes from 'too many cooks in the kitchen.'" — Hamel Husain

This resolves open question #7 from [04](04-cross-cutting-ux-and-open-questions.md) with a concrete recommendation: yes, introduce a role distinct from "whoever tunes prompt wording." Concretely:

- **Spec ownership and the pass/fail rubric for each success criterion belong to one named domain expert per Spec** (a PM, a compliance lead, a support-ops lead — whoever best represents the end user's actual needs), not to committee consensus.
- **Team-structure variant, confirmed for this team:** Hamel's default assumes the domain expert is also the hands-on annotator. Where the Prompt Engineer role already covers prompt strategy *and* writing/running evals (this team's actual structure — see [process-playbook/04](../process-playbook/04-roles-responsibilities-and-approvals.md)), it's the Prompt Engineer who does the day-to-day error-analysis pass, not the PM. The PM/domain expert still owns the Spec's content and the pass/fail bar, is the tie-breaker when a judge's verdict or an annotation looks wrong, and gives final sign-off — but they're consuming the Prompt Engineer's error-analysis summary and the citable run's results as evidence, not re-doing the annotation themselves. The one-owner-per-quality-bar principle stays intact; what changes is who's hands-on in the annotation loop day to day.
- Engineers still do plenty of the work (technical failure modes: retrieval errors, tool errors, malformed output), but "did this actually solve the user's problem" is the domain expert's call, evaluated on outcomes ("was an appointment made?"), not implementation details ("did the tool call succeed?").
- Only add a multi-annotator process (with Cohen's Kappa agreement tracking) if a single domain expert genuinely can't cover the domain — e.g., multiple regulatory jurisdictions. Default to one owner.

## Elevating error analysis to a first-class surface, not just a "Results" report

> "Build a custom annotation tool. This is the single most impactful investment you can make for your AI evaluation workflow." — Hamel Husain

The "Results" pane described in [02](02-workflow-starting-anew.md)/[04](04-cross-cutting-ux-and-open-questions.md) needs to be more than a pass-rate readout. It should double as the error-analysis workspace, because that workspace — not the initial spec-derived generation — is where eval quality actually comes from. Concretely, the Results pane should support (below, "domain expert" means whoever is hands-on in the annotation loop day to day — for this team, that's the Prompt Engineer, per the team-structure note above, with the PM as tie-breaker and final sign-off, not the primary annotator):

- **Structured filters and roll-up summaries**: filter by pass/fail, assertion type, which Spec criterion/guardrail is covered, failure-cluster/tag, or cost/latency outliers; summarize pass rate by criterion, the most common failure clusters, and trend vs. the previous run — so the pane answers "what's broken and how much" before anyone drills into individual rows.
- **Open coding**: free-text notes per run item ("wrong tone for this persona," "cites a policy that doesn't exist"), written by the domain expert, before any category exists — this is how new failure modes get discovered rather than forced into predetermined buckets.
- **Axial coding assist**: after a batch of notes exists, an LLM-assisted "cluster these notes into a failure taxonomy" pass — reviewed and corrected by the domain expert, never accepted blindly.
- **One-click promotion from a cluster to an artifact, LLM-drafted and human-confirmed**: turn a named failure-mode cluster directly into a new `AssertionVersion` (the LLM proposes the actual check from the cluster's notes) if it's now common/severe enough to warrant an automated check, into new `DatasetItem` rows so the specific failing case becomes a permanent regression test, into a new success criterion on a forked `SpecVersion` if the failure reveals a requirement the Spec never stated, or straight into a prompt edit when that's the more direct fix — this is the concrete mechanism behind Case C in [03](03-workflow-new-version-from-existing.md), and the suggest-first pattern behind it is the same as [06](06-sdd-alignment-and-resolutions.md)'s diff-driven regeneration answer.
- **Render outputs the way a domain expert actually reads them** (an email as an email, code with syntax highlighting, a structured output rendered as its structured shape), not a raw JSON dump — and keep the trace's full context (inputs, tool calls, reasoning) available but collapsed by default.
- **Fast review ergonomics**: a bounded progress indicator ("item 32 of 100"), keyboard shortcuts for pass/fail/next, and prioritization of items already flagged by an assertion failure, a low judge-confidence score, or negative user feedback (once online) — random sampling should still always be mixed in, so failure modes with no existing signal aren't invisible.
- **The sample pool is all real traffic, not just scored traffic — worth stating explicitly.** Online Evaluation only grades whatever slice of production it's sampling; a check, once it exists, can only ever surface what it was already built to detect. Neither replaces reading raw, ungraded traces — that's the only place a genuinely novel failure mode (one no Assertion or Judge Policy yet knows to look for) can actually be found. This matters more, not less, while Online Evaluation is still Phase 2 with no executor built (see below and [06](06-sdd-alignment-and-resolutions.md)): a real chunk of production traffic has no score attached to it at all right now, and the Results/annotation workspace should pull its random-sample slice from that ungraded pool too, not only from RunGroups that happened to execute.
- **Theoretical saturation as the stopping rule**, not a fixed count: keep reviewing until ~20 more items in a row produce no new failure category, with 100 reviewed as the practical floor. Note the scale caveat: this guidance applies once there's real data to review — production traces via Online Evaluation, or large batch runs. A dry run over a small seed-plus-synthetic dataset doesn't have 100 rows to offer; there, the rule is simply "read all of it," and the saturation discipline kicks in post-release.

## Structured synthetic data generation for the dry-run Dataset

> "A common mistake is prompting an LLM to 'give me test queries' without structure, resulting in generic, repetitive outputs. A structured approach using dimensions produces far better synthetic data." — Hamel Husain

This sharpens the Dataset-generation step inside "dry run" ([02](02-workflow-starting-anew.md) step 2, [01](01-concepts-and-entity-mapping.md)'s mapping table). Instead of generating rows directly from the Spec's examples/edge cases in one shot, the recommended algorithm is:

1. **Derive dimensions from the Spec** — each guardrail, each input-contract field, and each stated edge case is a candidate dimension (e.g., for a support bot: Issue Type, Customer Mood, Prior Context).
2. **Seed a handful of tuples by hand** (or take them directly from the Spec's own worked examples) — a specific combination of one value per dimension.
3. **Generate more tuples**, then **convert tuples to natural-language rows in a second, separate pass** — this two-step approach avoids the repetitive, generic phrasing that comes from asking an LLM for "more test cases" directly.
4. **Cap the first dry-run dataset small** (aligns with open question #5 in [04](04-cross-cutting-ux-and-open-questions.md)) — enough to sanity-check coverage across dimensions, not an exhaustive matrix. The dataset grows over time primarily through the error-analysis loop (real failing cases get added, per Case C), not through generating more synthetic rows upfront.

## CI-style batch runs vs. production monitoring — different jobs, different tools

> "Test datasets for CI are small and purpose-built... favor assertions or other deterministic checks over LLM-as-judge... For production traffic... you might rely more on expensive reference-free evaluators like LLM-as-judge." — Hamel Husain

This maps directly onto the data model's `RunGroupType` distinction and should shape defaults, not just be a technical footnote. **Phasing note (per the Eval Service SDD — [06](06-sdd-alignment-and-resolutions.md)):** `online` is a Phase 2 `RunGroupType` — the model supports it, but no executor is built yet in v1. Read "Online Evaluations" below as the target state; until it ships, the same role is filled by periodically **ingesting** batch/trace reports instead of a live binding.

- **Batch Suites (pre-publish, and any CI-style regression run)**: keep the dataset small and curated (dozens to a couple hundred rows, not thousands), and prefer `code_assertion` checks wherever possible so re-runs during iteration stay fast and cheap.
- **Online Evaluations (post-release, Phase 2)**: this is where the more expensive `rubric_grading`/judge-based checks earn their cost, run asynchronously over a sample of live traffic, because there's no reference output to compare against — only a judge's read of a real interaction. **This is a sample, not full coverage** — it only ever grades the slice of traffic it's pointed at. Error analysis should not be scoped to Online Evaluation output alone; the review/annotation workspace needs a path to pull raw, ungraded production traces too (a plain log/trace export, independent of any `RunGroup`), precisely because a failure mode outside what Online Evaluation samples, or outside what its judges are calibrated to catch, will never surface any other way.
- **The feedback loop is what closes it**: a new failure pattern found via error analysis on Online Evaluation (or, pre-Phase-2, ingested) results — **or on raw traces that were never run through any eval at all** — should get a representative case added back into the batch Dataset (Case C in [03](03-workflow-new-version-from-existing.md)) — **after PII redaction if it's a real trace**, since a Dataset row doesn't expire the way a Run payload does — so the next prompt iteration is checked against real production failure modes, not just the original Spec's examples. This is the concrete version of "these two systems are complementary" from the source material.

## Don't optimize for a 100% pass rate

> "Be wary of optimizing for high eval pass rates. If you're passing 100% of your evals, you're likely not challenging your system enough." — Hamel Husain

Worth stating explicitly in the dry-run and publish flow: a dry run that shows 100% pass on the first try is more likely a sign the dataset/assertions aren't stress-testing anything yet than a sign the prompt is perfect. The publish gate should check for a real citable run passing the eval's `RunPassRatio`, not chase a perfect score — and the error-analysis loop above is what should keep introducing harder cases over time so the bar stays meaningful.

## Summary: what changes in the mechanism because of this doc

| Mechanism as originally drafted | Refinement from current best practice |
|---|---|
| Dry run auto-generates a `rubric_grading` assertion per success criterion | Default to the cheapest tier (prompt fix → `code_assertion` → `rubric_grading`); tag generated assertions with their tier and let the user upgrade deliberately |
| Assertions are "draft" only in the versioning sense | Assertions are also **methodologically provisional** — treated as hypotheses until run against real error-analysis findings, regardless of version status |
| Publish gate = one citable run passing the eval | Publish gate stays just the citable run passing the eval; **judge calibration is recommended, optional practice** (human agreement/TPR-TNR on a labeled sample), not a required gate — per [02](02-workflow-starting-anew.md) step 6 |
| "Results" pane = pass-rate report | "Results" pane = full error-analysis workspace: structured filters and roll-up summaries, open coding, LLM-assisted clustering, and one-click, LLM-drafted/human-confirmed promotion of a failure cluster into a new assertion, dataset row, Spec criterion, or direct prompt edit |
| Dataset generated directly from Spec examples/edge cases | Dataset generated via structured dimensions → tuples → natural-language rows, kept intentionally small pre-publish, and grown mainly through the error-analysis/Case C loop afterward |
| Approval reviewer = generic "Reviewer/Approver" role | Recommend a named **domain-expert owner ("benevolent dictator")** per Spec who defines the pass/fail bar and is the primary error-analysis annotator |
| Success = high/100% pass rate | Success = a meaningful, appropriately-hard bar; a rising pass rate over time on a *growing, harder* dataset is the real signal, not a static 100% |
