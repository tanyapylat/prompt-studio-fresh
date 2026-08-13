# Workspace & Navigation

Cross-cutting shell requirements: the overall screen layout and app-level state. See
[`spec-driven-redesign/04`](../spec-driven-redesign/04-cross-cutting-ux-and-open-questions.md#ux-principles-the-feels-better-than-a-form-like-promptlayerlangsmith-bar)
"One workspace, five panes" principle.

Status legend: **Implemented** · **Partial** · **Planned**.

---

### WS-1 — Specs home as entry point
**Status:** Implemented
The app opens on a Specs list; there is no other route. Opening a Spec swaps the whole view to the Workspace; there's no browser-URL-addressable deep link into a specific Spec/tab (single-page state, not routed).

### WS-2 — Five-pane workspace layout
**Status:** Implemented
Opening a Spec shows a persistent left-hand Spec pane (SPEC-*) beside a tabbed main area with Prompt / Eval / Dataset / Results / Review tabs — one screen, no forced navigation between them, matching the "no forced navigation... single screen with lightweight tab/pane switching" principle.
- Default tab on open is Results.

### WS-3 — Persistent top action bar
**Status:** Implemented
Always visible while in a Spec's workspace: back-to-Specs, editable name, draft/published badge, citable-run badge (if applicable), live coverage count, Generate/Regenerate, Run (once a Target exists), and Publish (disabled per [REV-1](06-review-and-publish.md)).

### WS-4 — In-memory state only
**Status:** Partial
All state lives in a single React context, seeded once at load from a hardcoded seed file; there is no persistence layer, so a page refresh discards every change. This is an explicit, acceptable simplification for a click-through prototype, not a target-state requirement.

### WS-5 — Single-user, single-workspace
**Status:** Planned
No accounts, roles, or org-wide scoping exist yet — everything in this prototype is "my Specs," not the org-wide system-of-record/library positioning described in [`spec-driven-redesign/04`](../spec-driven-redesign/04-cross-cutting-ux-and-open-questions.md#positioning-system-of-record-and-library-not-a-personal-playground).
