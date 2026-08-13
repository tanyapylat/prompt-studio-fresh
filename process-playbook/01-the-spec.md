# The Spec: The Brief That Drives Everything

## What it is

A **Spec** is a short, written brief that answers one question: *"What is this prompt actually supposed to do, and how would we know if it did it?"* You write it **before** you write a single word of prompt wording — the same way a designer works from a brief, or an engineer works from a requirements doc, instead of jumping straight to the finished thing and reverse-engineering what it was supposed to do.

It's the single source of truth that everything else gets generated from: the first draft of the prompt, the first set of test cases, and the checks used to grade the results. Because all three come from the same brief, they start out in sync with each other by construction, instead of a prompt and its tests being written separately by different people at different times (today's most common failure mode).

## Why write it first, not after

Two concrete problems this solves that show up constantly today:

- **The prompt and its tests drift apart.** Someone tweaks the prompt wording six months in; nobody remembers to update the test cases to match. The Spec is the shared anchor both the prompt and the tests point back to, so a change to either one is visibly checked against the same brief.
- **"Good enough" is a personal, undocumented judgment call.** Without a written brief, "is this prompt done" lives entirely in one person's head. Writing the success criteria down — even three or four bullet points — turns a vague feeling into something a reviewer, a teammate, or an AI assistant can actually check against.

## What goes in a Spec

| Section | In plain terms | Required? |
|---|---|---|
| **Name** | What we call this prompt | Yes |
| **What goes in, what comes out** | What information does the prompt need, and what shape must the answer come back in — plain text, or something more structured with specific fields? | **Yes** — this is the one thing nothing downstream can be safely drafted without |
| **At least one success measure** | One clear statement of what "good" looks like for this prompt (e.g., "always cites a source," "never promises a refund") | **Yes**, at least one |
| **Goal / business context** | Why this prompt exists and who's on the receiving end of its output | Optional, but strongly recommended |
| **Things it must never do** | Tone, compliance, and safety lines it must not cross | Optional at first, add as you learn |
| **Worked examples** | A few real input → expected-output pairs | Optional at first |
| **Tricky/edge cases** | Inputs that are likely to trip it up, and how they should be handled | Optional at first |
| **Model or cost preferences** | Any known constraints on which model to use, latency, or budget | Optional |

**The bar for a first draft is deliberately low.** A Spec with just a name, one success measure, and a clear description of inputs/outputs is enough to save and generate a first draft from. Everything else — the business context, the guardrails, the worked examples — can be filled in over time as you iterate, rather than up front behind a long form. The two required fields (name aside) exist because without them, the system genuinely can't draft a usable first attempt at the prompt or its checks: it needs to know what's being fed in and what shape the answer needs to come back in before it can write anything sensible.

## Why input/output shape is non-negotiable

It's tempting to treat this as one more optional field, but it's structurally different from the rest of the brief: the prompt's wording, the format of its instructions, and the very first automated checks (e.g., "did the answer come back as valid data in the right shape") are all built directly from this one section. Two examples of what it should capture:

- **Inputs aren't always just "a block of text."** A support-ticket summarizer might take a single string. A pricing-quote generator might need several separate pieces of information — customer type, product, region — each with its own type. Say which one it is.
- **Outputs aren't always "whatever text comes back."** Sometimes free text is genuinely fine. Other times the answer needs to come back in a specific structured shape with certain fields always present (e.g., a summary field that's never empty). Say which one it is, and what's required.

## Who writes it

Typically the person who best understands what the end user actually needs — a product owner, a domain expert, someone close to the customer problem — not necessarily the person who will eventually tune the prompt wording. It's completely fine for one person to draft the Spec and hand it off; what matters is that it exists and is kept up to date, not who typed it. See [04-roles-responsibilities-and-approvals.md](04-roles-responsibilities-and-approvals.md) for how this splits across a team.

## What happens the moment you save it

Saving a Spec (even a thin one) is the trigger for everything else. It's the first step of [02-launching-a-brand-new-prompt.md](02-launching-a-brand-new-prompt.md): the system takes the brief and, in one action, drafts a first attempt at the prompt, a first set of test cases based on your examples and edge cases, and the checks that grade the results — then immediately runs a trial to show you, within seconds, whether that first attempt already clears the bar you just wrote down.
