# Process Playbook — How Prompt Work Should Flow

This is the **business-process companion** to the technical proposal in [`../spec-driven-redesign/`](../spec-driven-redesign/README.md). That set of docs is written for engineers and describes data models, versioned entities, and system architecture. **This set is written for anyone who needs to understand, approve, or follow the actual day-to-day workflow** — what a person does, in what order, who signs off, and why — without needing to know how any of it is stored under the hood.

If you're deciding *whether this process makes sense for the team*, read this set. If you're deciding *whether the technical design supports it*, read the other one. The [glossary](07-glossary.md) at the end maps plain terms used here to their technical names, so the two sets stay in sync.

## The idea in one paragraph

Today, writing a good prompt and proving it's good enough to ship are two loosely-connected efforts — someone writes a prompt, then separately (and often as an afterthought) someone sets up a handful of test cases to check it. This playbook proposes flipping the order: **write down what "good" means first** (a short brief we call the **Spec**), then let the system automatically draft a first version of the prompt *and* a first set of tests from that brief, together, so they're never out of sync. From there, the real work is reading actual outputs and fixing whichever of three things is wrong — the wording, the tests, or the brief itself — until it's genuinely good, at which point it goes through a lightweight review and ships. After it's live, the same discipline continues: real usage keeps teaching the tests new failure modes, which feed straight back into sharper checks and, when needed, an updated brief.

## How to read this set

| Doc | What it covers |
|---|---|
| [01-the-spec.md](01-the-spec.md) | What a Spec is, why you write it before touching prompt wording, what's required vs. optional, and who typically writes one. |
| [02-launching-a-brand-new-prompt.md](02-launching-a-brand-new-prompt.md) | The full journey for a prompt that doesn't exist yet: brief → first draft → read outputs → fix loop → lock in → review → ship. |
| [03-updating-an-existing-prompt.md](03-updating-an-existing-prompt.md) | The three different reasons you'd touch a prompt that's already live, and why each one follows a different, appropriately-sized path. |
| [04-roles-responsibilities-and-approvals.md](04-roles-responsibilities-and-approvals.md) | Who does what, who has final say over quality, how review works, and when a lighter-weight fast track applies. |
| [05-continuous-quality-and-feedback-loop.md](05-continuous-quality-and-feedback-loop.md) | What happens after release — how real usage keeps improving the tests and, sometimes, the brief itself. |
| [06-libraries-and-real-data.md](06-libraries-and-real-data.md) | How checks and test sets get reused across prompts, and how real usage becomes test cases and checks in bulk, not just one case at a time. |
| [07-glossary.md](07-glossary.md) | Plain-language terms used across this set, mapped to their technical equivalents for cross-referencing with the engineering docs. |
| [08-under-the-hood-technical-context.md](08-under-the-hood-technical-context.md) | *Optional, one page.* Not a repeat of the workflow or the glossary — just the handful of engineering facts that explain why certain rules above are trustworthy, and which parts are proven today vs. still being built. |

## What this replaces

Today, a prompt's "quality bar" lives in a loosely-connected pile of things: a short requirements note (if one exists at all), a set of test cases someone bolted on later, and three separate approval checkboxes that can drift out of sync with each other. This playbook proposes one continuous thread instead: **one brief drives the prompt and its tests together, one review looks at the whole bundle at once, and one feedback loop keeps it honest after launch** — replacing disconnected checklists with a single, traceable story from "what should this do" to "here's proof it does it."
