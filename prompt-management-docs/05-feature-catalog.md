# Feature Catalog

Brief overview of capabilities outside the core [Prompt Development Lifecycle](02-prompt-development-lifecycle.md). Each section covers purpose, where to find it, who can use it, and how it relates to prompt development.

---

## Batch Processing

**Purpose:** Run a saved prompt version over many spreadsheet rows asynchronously.

**Where:** `/batch-processing` tab, or from Prompt Editor Submit menu → **Start batch processing**

**Who:** Any authenticated user (main nav); project Read/Full for file operations

**Main actions:**
- Upload input file, validate prompt compatibility, start job
- Monitor status, cancel, download results
- View job history filtered by user email

**Lifecycle connection:** Can mark a version as executed (counts toward approval gate). Results can be exported from the editor or batch table.

**Gates:** Batch API URL is config/environment-specific

---

## Model Catalog

**Purpose:** Browse and manage models, aliases, redirect rules, benchmarks, and LLM rate limits.

**Where:** `/models` tab

**Who:** All authenticated users can browse; **Admin** required for writes (register model, edit aliases, redirect rules, limits)

**Main actions:**
- View models and pricing
- Register new models (with LiteLLM support/price checks)
- Manage aliases and redirect rules
- View benchmarks and LLM limits
- Search use-case impact before deleting models

**Lifecycle connection:** Model selection in Prompt Editor Config pulls from catalog data. Redirect rules affect routing for completions.

**Gates:** Admin for mutations; GenAI API proxy for CRUD

---

## Chat Playground

**Purpose:** General conversational playground with persisted chat threads.

**Where:** `/` or `/chat/:chatId?` (default home route)

**Who:** Any authenticated user

**Main actions:**
- Start chats, set system message templates, upload files
- Run completions independent of saved prompt projects

**Lifecycle connection:** None — separate from project/version workflow

---

## Prompt Comparison

**Purpose:** Run multiple saved prompts side by side and compare outputs with metrics.

**Where:** `/compare` tab; also **Add to Comparison** from Prompt Editor Submit menu

**Who:** Any authenticated user

**Main actions:**
- Select prompts/versions to compare
- Run batch comparison
- Export results to XLSX

**Lifecycle connection:** Used informally to evaluate changes; separate from formal Evaluations and approval gates

---

## Access Management

**Purpose:** Control who can view or edit a prompt project.

**Where:** Prompt Library → **Manage access** on project rows

**Who:** Users with Manage Access permission (strict Full on project, or Admin)

**Main actions:**
- Set **Read** and **Full** user lists
- Toggle **Everyone** for Read or Full access

**Lifecycle connection:** Full access required for editing, saving, approving, and most eval actions

---

## Settings (Admin)

**Purpose:** Infrastructure controls for LiteLLM and redirect rules.

**Where:** Profile menu → **Settings** (`/settings`)

**Who:** **Admin** only (`PromptStudioAdmin`)

**Main actions:**
- **LiteLLM** tab: manual enable/disable per environment (password-gated with “Pandora”)
- **Redirect Rules** tab: activate redirect rules globally

**Lifecycle connection:** Indirect — affects model routing for all completions

**Gates:** Admin role; LiteLLM tab has additional password gate

---

## Evaluations (formal)

**Purpose:** Configure, run, and track quality evaluations for prompt versions.

**Where:** `/evaluation/:projectId/:versionId` via **Evals** button in editor

**Who:** Full access for most actions; Read may create configs via API

**Lifecycle connection:** Core part of approval gates — see [Evaluations](03-evaluations.md)

---

## AI Agent Hub integration

**Purpose:** External meta-prompting agent for building prompts and evals.

**Where:** **Build Prompt / Build Eval with Agent** link on editor and eval pages

**Who:** Any user on those pages

**Lifecycle connection:** Optional helper for creation; not required for lifecycle

**Gates:** Agent Hub URL is environment-specific (prod/stg/integration)

---

## Use Case ↔ Initiative Mapping

**Purpose:** Finance tracking page mapping use cases to initiatives.

**Where:** `/usecaseinitiativemapping/*` (hidden from main nav)

**Who:** Uses anonymous GenAI proxy for some operations

**Lifecycle connection:** None

---

## User Feedback

**Purpose:** Collect user feedback via Microsoft Forms and SharePoint.

**Where:** Fixed side tab on all pages (except mobile)

**Who:** Any user

**Lifecycle connection:** None

---

## Legacy Prompt Library

**Purpose:** Older library UI with same underlying data.

**Where:** `/library-old` tab labeled **PL (Old)**

**Who:** Any authenticated user

**Lifecycle connection:** Same as Prompt Library; different table UX

**Uncertain behavior:** Both old and new library remain in navigation — may confuse users about which to use.

---

## Imports and exports

**Purpose:** Move data in and out of the application.

| Capability | Where | Format |
|---|---|---|
| Spreadsheet upload (variables) | Prompt Editor | CSV, XLSX |
| Spreadsheet download (results) | Prompt Editor, Batch table | XLSX |
| Comparison export | Compare page | XLSX |
| Eval YAML configs | Evaluations page | YAML |
| Dataset generation | Evaluations AI helpers | Generated test cases |

**Lifecycle connection:** Variable spreadsheets enable batch Submit; exports support offline review

---

## External integrations (background)

These affect outcomes but are not primary user workflows:

| Integration | Role |
|---|---|
| **GenerativeAi API** | Model catalog, LiteLLM, redirect rules |
| **LLM Batch Processing API** | Async batch job queue |
| **Jenkins + PromptFoo** | Eval and evolution job execution |
| **Dynatrace** | Trace source for online evals |
| **SharePoint** | Eval artifacts and file storage |
| **Power Automate** | Notifications (e.g. SkipApprovalGate publish email) |
| **PostHog** | Product analytics |

**Gates:** URLs, secrets, and feature flags in Helm/appsettings per environment

---

## API and SDK

**Purpose:** Programmatic access to prompts, completions, evals, permissions, and more.

**Where:**
- REST API v3 with Swagger at `/swagger/v3/swagger.json`
- Web app proxies requests via authenticated BFF
- .NET client SDK: `JA.PromptManagementApi.Client`
- Frontend RTK Query client: `psApiGenerated.ts`

**Who:** Authenticated applications and services; some endpoints require project policies or API keys (eval webhook)

**Lifecycle connection:** Completions API marks versions executed; published/testing/latest endpoints serve released versions (out of scope for this doc set)

---

## Relevant source areas

- Routes: `PromptManagementWebApp/Src/promptmanagementwebapp.client/src/routes.ts`, `Router.tsx`, `layout/Tabs.tsx`
- Feature inventory: `.test-toolkit/feature-tree.yaml`
- Batch: `batchProcessing/`, `BatchProcessingProxyController.cs`
- Model catalog: `modelCatalog/`, `GenAiApiProxyController.cs`
- Chat: `chat/`, `ChatController.cs`
- Compare: `promptComparison/`
- Settings: `settings/SettingsLayout.tsx`
