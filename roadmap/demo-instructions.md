# Demo: AI Studio — CQA pricing scenario

~4 minutes. Everything below is scripted in the app, so it behaves identically every time.

## Start it

```powershell
cd app
npm run dev
```

Open `http://localhost:5173/`. Dependencies are installed and `.env` has a working key, so you're in **live** mode — real model calls.

**Two things to know before you present:**

- There's no persistence. A page refresh resets everything to the seed data. That's your reset button, but don't refresh mid-demo.
- The scenario below is intercepted client-side, so it gives the same answers whether or not the API key is working. It won't fail in front of people.

---

## Setup before you share your screen

1. Click **Specs** in the sidebar so no Spec is open. *(The opening trigger only fires when you're not already inside a CQA Spec.)*
2. Open **North Star** — the bubble in the bottom right.

Note there are already two seeded Specs in the list. You're about to create a third, live.

---

## The run-through

Type each line into North Star. Wait for it to finish before the next one.

### 1. `generate CQA pricing detection`

It creates the Spec, generates the prompt, two assertions and a 14-row dataset, and runs the suite. Lands on **93%, 13 of 14 rows passing**.

> "I described what I wanted in one line. It built the spec, wrote the prompt, generated the checks and the test data, and ran it. That's the first slice from the roadmap — this bit exists."
>
> "And notice it didn't just hand me a green tick. It ran and told me one row fails."

### 2. `why did this fail?`

It explains the failing row: the conversation says *"they also charged my card twice"*, the model reads "they" as JustAnswer, but it's actually a photo-restoration vendor. It points out this is the exact failure mode the prompt's own examples warn about.

> "This is the bit I'd struggle to do by hand. It's not telling me a number went down, it's telling me *why* — and connecting it back to what the prompt already claims to handle."

### 3. `how do I fix this?`

It adds a new K-shot example to the prompt. Open the **Prompt** tab to show the change actually landed in the system message.

> "It's a draft. It edited the prompt, it didn't publish anything. I can rewrite that line myself if I disagree."

### 4. `add this as a test case`

It pins the failing row permanently into the dataset.

> "This is the round trip from slide 8. A failure becomes a permanent test. It survives regeneration, and it runs in every future suite — so this regression can't come back quietly."

### 5. `run it`

Re-runs all 14 rows. **100%.**

> "Fixed, and verified it didn't break the other thirteen. That whole loop was four sentences."

---

## Where to stop

Stop at 100%. Don't go wandering into other tabs — Observability is marked "Soon" and is a placeholder, and the Dashboard is thin.

If someone asks what else is in there, the honest answer: Specs, Prompts, Assertions and Datasets are real and clickable; Observability isn't built; nothing persists.

---

## If it doesn't respond as expected

Most likely you're already inside a CQA Spec when you type step 1. Click **Specs** in the sidebar and try again.

If a step gets skipped, the phrases that matter are: `why did this fail` (needs a question word *and* a failure word), `how do I fix this`, `add this as a test case`, `run it`. Paraphrasing is fine, those word pairs aren't.

---

## Shorter alternative — CC Headline

If you only have two minutes, or want a generation-first story rather than a fix-it story:

1. `generate CC headline` — creates the Spec from the real production brief, then asks which artifacts you want
2. `everything` — generates prompt, 5 assertions, 13 dataset rows
3. `yes` — runs it, **62%**, and tells you the dominant failure: 8 of 13 headlines start with "Fix your…"

This one is better for showing the step-by-step conversation (it asks before generating). The CQA one is better for showing the production round trip.
