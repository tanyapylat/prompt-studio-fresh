# AI Studio roadmap — what to say

~8 minutes at a normal pace. Slide 8 is the one worth the time; slides 3 and 7 are the ones to cut if you're running long.

Open by telling them what you want from the meeting, not by describing the deck.

---

## 1. Vision — 20 sec

This is where I think we should take the studio over the next year. It's deliberately loose. I want to leave with agreement on the direction and on what we build first — not with a plan.

One line to set it up: **today Prompt Studio helps you manage prompt versions. AI Studio should run the whole lifecycle around them — and AI should be able to do any step, with you able to take over any step.**

---

## 2. Why we're building it — 60 sec

Six things bother me about how we work today.

The one I'd fix first is on the left, second bullet. Your checks and your test data live inside the prompt version. You make v5, you rebuild them. So nobody invests in a good test set, because there's no point — it doesn't survive the next version.

We've also never written down what "good" means for a prompt. It's in people's heads.

Once a prompt is live we basically stop looking at it. You get a report. And when something does go wrong in production, there's no way to turn that into a test — so the same failure can come back and nothing catches it.

Approval checks that boxes are ticked, not that the prompt is any good.

And the AI help we have stops at writing the prompt.

The right side is those six inverted. The one I'd point at: **the same checks run before release and keep running against live traffic afterwards.** So the number you saw in testing and the number in production mean the same thing, and drift shows up as a number moving instead of a support ticket.

---

## 3. Current usage — 40 sec *(compress if short on time)*

Quick grounding, then we move on.

About 110 to 140 people a week. Editing prompts is most of it, then evaluations, then the library. That's basically the product.

Two things worth noticing at the bottom. Compare got three views in two weeks. The old library got two. So comparison as a separate page doesn't work — people want it where they're already running evals — and the old library can just go.

I'm not building the roadmap on this data. It's here so we agree on what people actually do today.

---

## 4. Target lifecycle — 50 sec

This is the loop I want us to support. Nine steps. Nothing on the roadmap is off this list.

The wording matters — "generated or authored", "proposed or hand-set", "generated or curated". Every one of these can be done by AI or by hand.

The part we have nothing for is the bottom right. Production tells you something, and there's no way back into your spec or your tests. Everything interesting on this roadmap is about closing that.

---

## 5. Automation and manual control — 50 sec *(compress if short)*

Same steps, both modes. Purple is the AI doing it, right-hand column is you doing it.

The thing I want to land: **you pick per step, not per path.** You might write the spec yourself and let it generate the test data. Or let it draft everything and then rewrite the prompt by hand. It isn't two routes where you commit at the start.

Bottom line is the ambition — the AI path becomes the one people reach for first, not the fallback. That's where we're going, not where we are.

And one thing that doesn't bend: however you got there, the prompt has evaluation evidence before it publishes.

---

## 6. The assistant — 50 sec

This is the piece I care most about, and the easiest one to get wrong.

Left is what it actually does — not "AI-powered", specific things. It reads a failed run and tells you what the failing cases have in common. It takes a production trace and hands you back a test case with the expected output already filled in.

Right is where it stops. It never approves, never publishes, never touches production. Everything it gives you is a draft you can edit.

Why I call it a layer and not a feature: **it carries context across the loop.** The spec it helped you write is what it uses to suggest checks. The production failure is what it uses to suggest the spec change. Seven separate AI buttons wouldn't do that.

---

## 7. Building blocks — 25 sec *(fast — this is a map, not an argument)*

Six blocks, assistant across all of them.

All six exist from day one as design intent. The roadmap isn't which ones we build — it's how deep each one goes, and when.

---

## 8. Loose roadmap — 2 min *(slow down here)*

This is the slide I want to spend time on.

Every column has two halves. Top is what's new. Bottom is what we take over from Prompt Studio.

That split is my answer to the thing I've been stuck on. We have to replace things that have gotten slow — prompt authoring, eval authoring — and we want to build things we've never had — traces, observability, online evals, the assistant. If I run those as two tracks, one of them starves. Usually the replacement work, because it's less interesting. Sometimes the new work, because replacement feels obligatory.

So the rule is: **the new capability leads, and we take over from Prompt Studio only as far as that new thing needs.** Spec-driven generation is first, so we need authoring, configuring and running in AI Studio — otherwise the agent produces a prompt with nowhere to live. But we don't rebuild the editor for parity. We build exactly enough.

Earlier is both things already in motion — the spec and generation agent, and the online evals we've started in Prompt Studio. I didn't invent a first horizon. I picked up what's already moving.

Next is the production round trip — a trace becomes a test case — plus datasets and checks as shared assets, and a real view of production quality. Comparison folds into evaluation there, with regression running automatically on every change.

Later is approval and publishing, and connecting quality to business outcomes.

None of this is committed. This is the shape I want us to argue about.

---

## 9. Transition — 40 sec

Nobody gets migrated. Both products work on the same prompts, so you don't move your work or start over.

We keep what already works — batch, the model catalog, the evaluation running itself.

Nothing changes for the teams whose applications use our prompts.

Two things retire early because nobody uses them. And one thing I want to be explicit about: the AI review at approval gets **redesigned, not deleted.** We still need a check before something goes live. It should just look at real evidence — coverage, regressions, cost — instead of flags.

---

## 10. What we build first — 80 sec

Here's the concrete ask.

You describe what the prompt needs to do. The assistant builds the spec with you, writes the prompt from it, and generates the first checks and test data. You run it and read every output. All in one place.

Four reasons this one. It's already being built. Prompt Studio has no version of it. It drags in exactly the authoring and testing surface we need and nothing extra. And it produces the first reusable checks and datasets — which everything later depends on.

What's not in it: approval and publishing stay in Prompt Studio. No comparison, no production evaluation yet.

Three things I need from you:

1. Is this the right first slice?
2. Which team and which prompt do we build it around?
3. Is a spec required or optional? My take is optional — a prompt can exist without one, but it still needs evaluation evidence to publish.

Then stop. **"What do you want to push back on?"**

---

## If you're at 5 minutes

Slides 1, 2, 4, 8, 10. Show 6 for twenty seconds on the way past. Skip 3, 5, 7, 9 and pick them up if someone asks.

## Likely pushback

**"Why not just fix Prompt Studio?"** — Because the thing that's broken isn't the UI, it's that evaluation assets don't outlive a prompt version and production is a dead end. Both are structural.

**"Isn't this a lot?"** — That's what slide 8 is for. First slice is one workflow with one team.

**"What about the trace viewer?"** — Separate track, separate owner. What we own is turning a trace into a test case.
