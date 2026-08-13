# Roles, Responsibilities, and Approvals

Good process needs clear ownership, not just clear steps. This doc covers who does what, who has final say over quality, and how review and approval actually work day to day.

## The roles

| Role | What they own | What they're not responsible for |
|---|---|---|
| **Prompt Engineer** | Prompt strategy and wording end to end, translating success criteria into concrete evals/checks, building and running the test loop, reading trial outputs, doing the day-to-day error-analysis pass | Deciding what "good" means in the first place, and the final call on whether a version ships — that's the Product Manager's call |
| **Product Manager / Brief Owner** | Writing (or commissioning) the brief, defining what success actually looks like in business/user terms, final sign-off before release | Tuning prompt wording, writing evals, or doing the hands-on output review day to day — that's the Prompt Engineer's job |
| **Reviewer / Approver** | Giving the final sign-off before release, ideally the same person as the Product Manager | Writing the prompt or the brief themselves — a reviewer should not be reviewing their own work |
| **Engineer** | Adding brand-new kinds of automated checks when nothing existing covers a need | Day-to-day prompt iteration or writing the brief |
| **AI Assistant** | Drafting first attempts (prompt, tests, checks), doing a first-pass review with comments and flags | **Never has final approval authority** — every gate that matters ends with a human decision |

On a small team, several of these can be the same person — what matters is that the *brief owner* and the *reviewer* are, wherever possible, not the same person as whoever wrote the prompt wording being reviewed. That separation is what keeps "is this actually good" an honest question instead of the author grading their own homework.

**Where the line actually falls.** The split isn't "who tests vs. who doesn't" — the Prompt Engineer writes the evals too. It's "who owns the Spec's content vs. who owns everything that proves the Spec is met." If a decision is about *what* the prompt should do, or whether the business is comfortable shipping it, that's the Product Manager. If it's about *how* to get there, or how to prove it got there — including the checks and test cases themselves — that's the Prompt Engineer. Practically, this means the Product Manager approves based on the citable run's results and the Prompt Engineer's summary, not on redoing the output review themselves; they're the tie-breaker when a result is ambiguous or when a recurring failure looks like it should become a new requirement, not the primary annotator on every run.

## Why one named owner, not a committee

For any given prompt, **one specific person should own the quality bar** — the brief, the definition of "good," and the final approval call — rather than quality being a shared, undefined responsibility across a group. This isn't about limiting who can contribute; it's about avoiding the two failure modes that show up when nobody owns it: quality drifting because everyone assumes someone else is watching it, and endless back-and-forth because too many people have an equal, undefined say in what "good enough" means.

That person should ideally be the one closest to the actual end user's needs — a product owner, a compliance lead, a support-ops lead — not necessarily the most technical person on the team. Their job is to judge outcomes ("did this actually solve the customer's problem") rather than implementation details ("did the code technically run without erroring").

**When does this need more than one person?** Only when a single owner genuinely can't cover the whole domain — for example, a prompt that has to satisfy meaningfully different regulatory rules in different regions. Default to one owner; add more only when there's a real, specific reason to.

## How review works: a real review, not a rubber stamp

The review that happens before release should feel like reviewing a finished piece of work, not clicking a single "approve" button on a form:

- **The reviewer sees everything that changed, together** — the brief, the prompt wording, every check, the test set, and the actual results — compared against what's live today, so they're reviewing one coherent story, not three disconnected checkboxes.
- **Comments attach to the specific thing they're about** — a particular line of the brief, a particular check, a particular result — and stay visible on that version going forward, so the reasoning behind a decision is never lost to a hallway conversation nobody wrote down.
- **An AI assistant does the first pass.** Before the human even looks, it flags things like a requirement with nothing checking it, an oddly-worded check, a suspicious jump in the pass rate, or a cost/speed regression versus what's live today. It only ever comments and summarizes — never approves. This isn't about replacing the reviewer's judgment; it's about making sure the reviewer's attention goes straight to what actually needs it instead of re-discovering it from scratch.
- **The verdict is binary: Approve, or Request Changes.** A request for changes sends things back to the fix loop — since what was reviewed is already locked in, any fix produces a fresh version rather than quietly altering the one that was reviewed, and comes back around for a fresh, focused review once ready.

## When does a lighter-weight fast track make sense?

Not every change deserves the same amount of ceremony. A recommended, principled fast track: if the new version shows **no drop in quality** against what's currently live, and the change **doesn't touch or add any subjective, AI-graded check** (i.e., it's a wording-only tweak, or purely adds sharper test coverage without changing what "pass" means) — it can auto-clear with an async notification to the brief owner, instead of waiting on a synchronous review. Anything that touches guardrails, success criteria, or how something subjective gets graded should always go through full human review — that's exactly the kind of change where a quiet drift in judgment is easiest to miss and most costly to get wrong.

## Where an engineer gets involved

Most checks needed for a given requirement should come from an existing, trusted library of check types rather than being written from scratch every time — think of it like a shared toolbox of common, pre-approved checks (does the output contain or avoid certain text, is it valid structured data, does a number fall in range, was the right action taken) that a first draft picks from automatically. When a requirement genuinely doesn't fit anything in that toolbox, the system can write a small custom check on its own — but anything written this way is always flagged for a human to look at during review, never trusted silently. Only a check that's too unusual or sensitive even for that becomes a request for an engineer to build a proper, reusable addition to the shared toolbox. This keeps day-to-day iteration fast without quietly trusting unreviewed, freshly-written logic to gate a release on its own.

## The short version

One named owner per prompt decides what "good" means and gives final sign-off. Whoever tunes the wording day to day is usually a different person. Every release goes through a real review — AI-assisted, human-decided — before it ships, with a lighter fast track reserved specifically for low-risk, no-regression changes. Custom logic beyond the standard toolbox always gets a human's eyes on it before it's trusted.
