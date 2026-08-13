# Glossary: Plain Terms Used Here vs. Technical Terms

This set of docs deliberately avoids data-model and engineering vocabulary. This table maps the plain-language terms used across this playbook to their technical equivalents in [`../spec-driven-redesign/`](../spec-driven-redesign/README.md), so the two sets stay easy to cross-reference.

| Plain term used in this playbook | Technical equivalent | Where it's covered in detail |
|---|---|---|
| The brief | Spec | [spec-driven-redesign/01](../spec-driven-redesign/01-concepts-and-entity-mapping.md) |
| A version of the brief | `SpecVersion` | same |
| A check | Assertion | same |
| A simple, rule-based check | `code_assertion` | same |
| A subjective, AI-graded check | `rubric_grading` assertion | same |
| The automated grader / AI judge | Judge Policy | same |
| The test set | Dataset | same |
| A single test case / example | `DatasetItem` | same |
| The full bundle of checks + grading rules | Eval | same |
| The prompt (and model) under test | Target | same |
| Running the prompt against the test set and checks | Suite | same |
| A trial run | Non-citable `RunGroup` | [spec-driven-redesign/02](../spec-driven-redesign/02-workflow-starting-anew.md) |
| The official, on-record run | Citable `RunGroup` | same |
| "In progress" | draft (lifecycle state) | [spec-driven-redesign/01](../spec-driven-redesign/01-concepts-and-entity-mapping.md) |
| "Locking it in" | Publish (freezing the whole bundle atomically) | [spec-driven-redesign/02](../spec-driven-redesign/02-workflow-starting-anew.md) |
| "Retired" | deprecated (lifecycle state) | [spec-driven-redesign/01](../spec-driven-redesign/01-concepts-and-entity-mapping.md) |
| Shipping it | Release | same |
| The system this all runs on | Evals Platform | [spec-driven-redesign/README](../spec-driven-redesign/README.md) |
| The shared toolbox of standard checks | the promptfoo assertions library | [spec-driven-redesign/02](../spec-driven-redesign/02-workflow-starting-anew.md), step 2 |
| Spot-checking the automated grader against your own judgment | judge calibration | [spec-driven-redesign/05](../spec-driven-redesign/05-eval-methodology-best-practices.md) |
| Reading results and jotting notes | open coding / error analysis | same |
| Grouping notes into named patterns | axial coding / failure taxonomy | same |
| Brief owner / person who owns the quality bar | Product Manager, the "benevolent dictator" domain expert for the Spec | same, and [process-playbook/04](04-roles-responsibilities-and-approvals.md) |
| Person who tunes wording and runs the test loop day to day | Prompt Engineer | [process-playbook/04](04-roles-responsibilities-and-approvals.md) |
| Reviewing real usage after launch | Online Evaluation (target state — Phase 2, not fully built yet) | [spec-driven-redesign/06](../spec-driven-redesign/06-sdd-alignment-and-resolutions.md) |
| Pulling in exported reports as an interim substitute | ingested batch/trace reports | same |
| Turning a real interaction into a permanent test case safely | PII redaction before promoting a trace into a `DatasetItem` | [spec-driven-redesign/03](../spec-driven-redesign/03-workflow-new-version-from-existing.md), Case C |
| Lighter-weight approval path for low-risk changes | fast-track approval tier | [spec-driven-redesign/06](../spec-driven-redesign/06-sdd-alignment-and-resolutions.md) |
| Browsing real usage directly to build test cases/checks in bulk | the Library's real-data browse surface | [spec-driven-redesign/04](../spec-driven-redesign/04-cross-cutting-ux-and-open-questions.md), "Libraries need a path in from real data" |

## Case names, if you need to match them up

| This playbook | Technical docs |
|---|---|
| [02-launching-a-brand-new-prompt.md](02-launching-a-brand-new-prompt.md) | Case 1 — [spec-driven-redesign/02](../spec-driven-redesign/02-workflow-starting-anew.md) |
| [03-updating-an-existing-prompt.md](03-updating-an-existing-prompt.md), Path A | Case 2A — [spec-driven-redesign/03](../spec-driven-redesign/03-workflow-new-version-from-existing.md) |
| [03-updating-an-existing-prompt.md](03-updating-an-existing-prompt.md), Path B | Case 2B — same |
| [03-updating-an-existing-prompt.md](03-updating-an-existing-prompt.md), Path C | Case 2C — same |
