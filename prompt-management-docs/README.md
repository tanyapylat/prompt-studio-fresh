# Prompt Management — Current-State Documentation

This documentation describes how the Prompt Management application works today. It is written for a **coding or product agent** that needs to understand the current prompt development process before changing or redesigning it.

## How to use this set

1. Start with [Overview](01-overview.md) for product purpose, main surfaces, roles, and access model.
2. Read [Prompt Development Lifecycle](02-prompt-development-lifecycle.md) for the end-to-end user journey from project creation through publish.
3. Use [Evaluations](03-evaluations.md) and [Approvals and Publishing](04-approvals-and-publishing.md) for the detailed rules that gate publishing.
4. Refer to [Feature Catalog](05-feature-catalog.md) for capabilities outside the core lifecycle.

## What this set covers

- Current behavior only — no redesign proposals
- User-visible workflows first, with background rules only when they change outcomes
- Role responsibilities: **Creator**, **Reviewer/Approver**, **Admin**
- Current rules and constraints listed beside each step
- Role, permission, admin, config, and environment gates labeled where relevant
- Uncertain or inconsistent behavior flagged inline where it affects a workflow

## What this set does not cover

- Downstream application consumption after a version is published
- Internal architecture (controllers, handlers, databases)
- Click-by-click instructions or screenshots
- Future process recommendations

## Document index

| Document | Purpose |
|---|---|
| [01-overview.md](01-overview.md) | Product purpose, surfaces, glossary, access model |
| [02-prompt-development-lifecycle.md](02-prompt-development-lifecycle.md) | Primary lifecycle: create → version → configure → execute → compare → approve → publish |
| [03-evaluations.md](03-evaluations.md) | Evaluation configurations, runs, final config, relevancy |
| [04-approvals-and-publishing.md](04-approvals-and-publishing.md) | Approval gates, validation, publish rules, SkipApprovalGate |
| [05-feature-catalog.md](05-feature-catalog.md) | Other product capabilities (batch processing, model catalog, chat, etc.) |
