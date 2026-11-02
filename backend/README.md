# Metaflow backend

Local workflow-draft persistence using Node.js 24, TypeScript, Fastify, and MySQL.
The server listens on `127.0.0.1` only. Authentication and ownership must be added
before shared deployment; `NODE_ENV=production` is deliberately rejected.

## Setup

Windows PowerShell examples use `npm.cmd` to avoid script execution-policy errors.
On macOS or Linux, use `npm` instead.

1. Install Node.js 24 and MySQL 8.0.16 or newer (8.4 LTS recommended).
2. Create a dedicated empty MySQL database for Metaflow, for example
   `CREATE DATABASE metaflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`.
   Use a database user that can create the app's tables; do not point this at an
   unrelated database.
3. From `backend/`, run `npm.cmd ci`.
4. Supply `DATABASE_URL` in the backend process environment. Optional configuration
   is documented in `.env.example`; that file contains no real secrets.

PowerShell can accept the connection URL without recording its value in command history:

```powershell
$metaflowConnection = Read-Host 'MySQL connection URL' -AsSecureString
$env:DATABASE_URL = [System.Net.NetworkCredential]::new('', $metaflowConnection).Password
npm.cmd run dev
```

The URL shape is `mysql://USER:PASSWORD@HOST:PORT/DATABASE`. URL-encode special
characters in credentials. Use `DATABASE_SSL=true` for verified TLS and configure
a trusted CA when needed. URL query parameters are intentionally rejected so that
TLS configuration cannot silently bypass certificate verification.

The default API port is `3001`. Startup applies versioned SQL migrations under a
MySQL session lock. MySQL DDL commits implicitly, so each migration file contains
one retry-safe statement, recorded only after success. Checksums reject edits to
already applied migrations. `npm run db:migrate` runs the same migrations without
starting the API.

Start `npm run dev` from `frontend/` in a second terminal. Its fixed-port local Vite
server proxies `/api` to `http://127.0.0.1:3001`. If you change `PORT`, update that
proxy too. The repository's `.htaccess` blocks direct Apache access to source files;
use Vite for the frontend rather than serving the source directory through XAMPP.

## API contract

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | `/api/health` | none | `{ "status": "ok" }`, or 503 if database access fails |
| POST | `/api/prepare` | `{ prompt, attachment? }` | One Muse request returning graph AND configured plan; unsaved |
| GET | `/api/connections` | none | Saved connection IDs, names, and purposes only |
| POST | `/api/parse` | `{ prompt, attachment? }` | `{ draft: WorkflowDraft, model: "muse-spark-1.3" }`; does not save automatically |
| POST | `/api/plan` | `WorkflowDraft` | `{ plan: WorkflowPlan, model: "muse-spark-1.3" }`; explicit detailed planning, no automatic save |
| GET | `/api/workflows` | none | `{ "workflows": [...] }`, latest 50 draft summaries |
| POST | `/api/workflows` | `WorkflowDraft` | 201, `{ "workflow": SavedWorkflow }` and Location header |
| GET | `/api/workflows/:id` | UUID path parameter | `{ "workflow": SavedWorkflow }` |
| PATCH | `/api/workflows/:id` | `{ expectedVersion, draft: WorkflowDraft }` | `{ "workflow": SavedWorkflow }` |

`WorkflowDraft` contains `{ prompt, diagram, plan }`; shared TypeScript contracts
are in `../shared/workflows.ts`. A saved workflow has a server-generated UUID,
version, and UTC creation/update timestamps. The IDs inside diagram and plan
documents are separate from the database workflow UUID.

PATCH replaces the entire draft, requires the last saved version, and atomically
creates a new immutable version. Conflicting saves return 409; reopen the saved
workflow before retrying. Automatic POST retries are not enabled: if a connection
fails after a save, refresh the saved-draft list before trying another creation.
Create and update recompute the plan's setup checks from the supplied configuration
and review flags before storing it; stale browser check summaries are not trusted.

Detailed planning must return exactly one step per existing diagram node, with the
same ID and role. Reviewed steps and webhook configuration are retained. Answered
questions keep their original wording, IDs, and answers. If Muse reuses an answered
question's ID for a different question, the new question gets a distinct ID rather
than replacing or hiding the answer. Duplicate question IDs and references to
unknown steps are rejected. Planning returns an unsaved plan; provider failures
or invalid proposals never write a new draft version.

Errors have the shape `{ error: { code, message, requestId } }`. Validation errors
return 400, missing workflows return 404, oversized requests return 413, and
database failures return 503. Unknown fields are rejected rather than stripped;
JSON types are never coerced. Saved-draft limits include 512 KB per request, 100 diagram
nodes/plan steps, 200 edges, 200-character titles, and 4,000-character descriptions.
IDs must be unique within each collection, edges and questions must reference
existing nodes, and the plan must match its source diagram. Cycles are rejected.
Unresolved configuration is allowed because these records are drafts.

Webhook definitions contain credential **references**, not credential values.
Endpoint templates require HTTPS without embedded credentials, query strings, or
fragments. The exact configured loopback test receiver is the sole HTTP exception.
Saving configuration sends nothing. An explicit outgoing delivery test can resolve
credentials and send the mapped payload; it does not register incoming webhooks or
execute the full workflow. See Outgoing webhook delivery below.

## Frontend behavior

The Plan Workflow screen supports editable step operations, fields, settings,
mappings, question answers, and webhook configuration. Save updates the URL with
`?workflow=UUID`; the selected saved ID stays in the URL across stages, so reloading
the canvas, repair, or logs page also retrieves the draft from MySQL. The prompt,
diagram, plan, setup review flags, question answers, canvas positions, and names
are saved together as a new version. No new migration is needed for these JSON
draft fields. Original uploaded file bytes and session activity are not persisted.

Descriptions and diagrams submitted with Continue use `POST /api/prepare` for a
graph and detailed setup in one Muse request. `/api/parse` remains the graph-only
compatibility endpoint. Direct navigation before selecting a workflow shows an empty
state. `/api/plan` updates setup from answers and saved connections only when selected.
Page navigation, setup edits, saved-draft operations, and activity viewing do not
call Muse. Explicit outgoing webhook tests also make no Muse calls. The first
canvas run of each saved version prepares execution with Muse, and repair
suggestions use a separate bounded AI call. Runs then execute on the backend.
Incoming events and native app connectors remain pending; active pages use real
run records. Database persistence and reused execution definitions need no AI call.

## Muse parsing endpoint

The default `/api/prepare` route accepts the same input below. It validates the
combined graph, operations, settings, mappings, questions, and connection selections
before returning a draft. It does not save, register, execute, or test anything.
Machine configuration is stored as `configuredBy: "muse"`, separately from human
review flags. Missing business rules remain `needsInput` settings and questions.
There are no automatic AI retries or extra planning calls on navigation.

## Connect outgoing services once

From the backend folder, run:

```powershell
npm.cmd run webhook:connection -- support_notifications
npm.cmd run webhook:secret -- support_token
```

The first command asks for a name, purpose, receiver URL, authentication type,
header name, and credential **reference** (e.g. `support_token`). The second stores
the real credential privately. Allow the receiver origin in `WEBHOOK_ALLOWED_ORIGINS`
as described under outgoing delivery. These commands do not contact Muse or the receiver.

Connections persist in `%LOCALAPPDATA%/Metaflow/connections.json` on Windows
(`~/.config/Metaflow/connections.json` elsewhere). `WEBHOOK_CONNECTIONS_FILE` can
select an external file. Do not store it under XAMPP or commit real connection data.
The file is a JSON array of up to 20 entries:

```json
[
  {
    "id": "support_notifications",
    "name": "Support notifications",
    "description": "Send support request subjects to the support team",
    "endpointUrl": "https://receiver.example.com/events",
    "authentication": {
      "type": "secret-header",
      "headerName": "X-Token",
      "secretRef": "support_token"
    }
  }
]
```

Muse receives connection IDs, names, and purposes only. The backend resolves its
selection to the stored URL and credential reference, checks credential availability,
and derives webhook mappings from the proposed payload. Unknown selections are
rejected; missing services or credentials become questions. Save and delivery both
reject changed or removed bindings. Delivery still enforces the origin allowlist,
public DNS checks, secret loading, and immutable saved versions. Incoming event
receivers and native API/OAuth connectors are not provisioned by this feature.

## Parsing input format

`POST /api/parse` accepts a required `prompt` string (up to 4,000 characters;
may be empty when a diagram is supplied) and an optional `attachment`:

```json
{
  "prompt": "When a Shopify order arrives, create a deal and notify sales.",
  "attachment": {
    "name": "workflow.png",
    "mimeType": "image/png",
    "data": "BASE64_FILE_BYTES"
  }
}
```

Omit `attachment` for text-only parsing. Supported file types are PNG, JPEG, and
PDF, up to 10 MB decoded. The route has a 14 MB JSON-body limit for base64 overhead;
saved-draft routes retain their 512 KB limit. The server rejects unknown fields,
malformed base64, extension/type mismatches, and invalid file signatures before
calling Muse. These checks do not fully decode/render files; Meta may still reject
a corrupt file. User-supplied remote URLs are not accepted.

The parser loads `MODEL_API_KEY` first, then the saved Windows credential. It sends
one request to Meta's Responses API using `muse-spark-1.3`, inline image/PDF data,
`store: false`, strict `text.format` JSON Schema, and at most 8,192 output tokens.
Parsing requests use minimal reasoning; detailed planning uses low reasoning.
The schema sent to Muse retains field types, required properties, enums, and closed
objects. Text patterns and string/array limits are enforced by the backend after
generation instead of by Muse's constrained decoder. This is a compatibility
workaround for the repeated workflow-request failures. A live two-step text-only
workflow passed parsing and backend validation after this change. Larger workflows,
diagram uploads, and detailed planning still need live verification.
Output exhaustion returns `MUSE_OUTPUT_LIMIT` rather than a generic provider error;
partial results never become drafts. With logging enabled, response diagnostics
contain only operation, HTTP status, provider request ID, and available token counts
and response status. Prompts, response bodies, and credentials are not logged.
There are no automatic retries. Calls time out after 90 seconds, and client
disconnects cancel the upstream request when detected. Only one parse or detailed
planning request runs at a time per server process. API usage charges may still
apply after cancellation.

The model returns title, summary, nodes, edges, review notes, and up to 10 webhook
suggestions in the same request. Each suggestion links to exactly one step and
includes its direction, event, purpose, reason, and up to 20 proposed payload fields.
Incoming suggestions require trigger steps; outgoing suggestions require action
steps. An ordinary native API/OAuth action is not automatically a webhook.

The server
validates the shape and graph, assigns document IDs and layout positions, and
builds a matching plan. Suggested webhooks carry `suggestedBy: "muse"`; their URLs
are generated under `.invalid`, and authentication contains only placeholder header
names and credential references. Payload values are dotted field references, never
literal credentials or executable expressions. Linked steps receive proposed field
mappings and webhook setup marked as required. Duplicate suggestion IDs, duplicate
step links or payload fields, unknown steps, and incompatible roles are rejected.
Suggestions can be saved and reopened with the draft. The setup form allows an
intended HTTPS URL, header and credential reference name, and payload fields to be
edited. Actual secrets are not entered in the reference field. Endpoint, authentication,
and payload review flags are validated separately. Reviewed payload mappings must
agree with the linked step. Configuration is displayed as Setup reviewed;
it never registers or marks a webhook Connected. No suggestion URL is fetched.

Parsing supplies the initial graph and draft scaffold. Detailed planning is a separate
explicit action. Neither output is an executable engine definition. No database
write occurs until the user saves. Actual app actions are recorded in session activity.

Errors include `MUSE_NOT_CONFIGURED` (503), key/access or billing failures (503),
`PARSE_BUSY`/`MUSE_RATE_LIMITED` (429), invalid or rejected AI results (502),
`NO_WORKFLOW_FOUND` (422), and `MUSE_TIMEOUT` (504). Provider bodies, credentials,
and raw exceptions are never returned or logged. Parse failures never return the
an example workflow. See [Meta structured output](https://dev.meta.ai/docs/structured-output)
and [inline file handling](https://dev.meta.ai/docs/file-handling).

## Detailed planning and setup review

`POST /api/plan` accepts the current `WorkflowDraft` and first validates its graph
and configuration. It asks Muse for titles, descriptions, operations, input/output
fields, configuration values, mappings, expected outcome, and open questions for
the existing node IDs and roles. Missing business rules remain unresolved. The
server retains graph edges, webhook endpoints, authentication references, and
human-reviewed steps. Webhook endpoint/authentication properties are excluded from
the AI context. The user description, graph, step settings, mapping references,
and question answers are part of the planning context.

The response uses strict structured output, the same server-held key, an 8,192-token
output limit, a 90-second timeout, and no automatic retries. New AI proposals are
not marked human-reviewed. Invalid results leave the current draft unchanged.
Neither page navigation nor editing automatically invokes this endpoint.

Step `reviewed`, plan `structureReviewed`/`generatedBy`, question `answer`, and
webhook `setup` review flags are optional for compatibility with older drafts.
`shared/setup.ts` derives current setup progress and checks. Reviewed settings must
be valid; webhook payload review must match its step's mappings. Addresses remain
inert until an explicit outgoing test-delivery request or an authorized workflow
run. Incoming event reception remains unavailable.

## Outgoing webhook delivery

Review and save the webhook endpoint, authentication reference, and payload mappings,
then use Test delivery in Plan Workflow. Edits must be saved before sending. The
backend retrieves the named saved version; request bodies cannot override its URL
or credentials. Incoming webhooks cannot be sent through this action.

Allow exact public HTTPS origins with `WEBHOOK_ALLOWED_ORIGINS`, for example
`https://receiver.example.com`. Non-public DNS results, mixed public/private DNS
answers, unsafe URL forms, and redirects are blocked. DNS is checked before each
send and the connection is pinned to the checked address, keeping the original
hostname for TLS certificate verification. There is no redirect following or
automatic retry. For a local development receiver only, set
`WEBHOOK_LOCAL_RECEIVER_URL=http://127.0.0.1:PORT/receiver`; only that exact URL is
allowed, and the exception is rejected in production mode.

On Windows, save a credential privately once:

```powershell
npm.cmd run webhook:secret -- sales_webhook_secret
```

Enter the secret at the hidden prompt. It is stored in Windows Credential Manager
under `Metaflow/Webhook/sales_webhook_secret`, separately from the Muse key. An
injected `WEBHOOK_SECRET_sales_webhook_secret` environment variable takes precedence;
use your secret manager for other operating systems. Secret values never enter
the browser or draft JSON. Secret-header authentication sends the value in the
configured header. Signature authentication sends `sha256=<hex HMAC-SHA256>` over
the exact UTF-8 JSON body; the receiver must implement this same signing format.

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/api/workflows/:id/webhooks/:webhookId/test-deliveries` | Send one real outgoing event from a saved version |
| GET | `/api/workflows/:id/webhooks/:webhookId/deliveries` | Latest 20 persisted attempts, newest first |

POST accepts `{ requestId: UUID, expectedVersion: number, sampleData: object }`.
For a mapping such as `subject: "{{request.subject}}"`, supply
`{ "request": { "subject": "Test message" } }` as sampleData. Every mapped field
must exist. Requests are limited to 32 KB and the resolved payload to 16 KB.
The backend adds `X-Metaflow-Event`, `X-Metaflow-Delivery-Id`, and `Idempotency-Key`.
It reserves a pending database record before sending. Reusing the same request ID
and input returns the stored attempt without another HTTP send; different input
with the same ID returns 409. A receiver should also deduplicate delivery IDs.

HTTP 2xx means accepted, other HTTP responses mean rejected. Timeout (five seconds
by default) and connection loss produce an unknown outcome because the receiver
may already have acted. A crash or result-storage failure can leave a pending
record. Check receiver logs before manually initiating another delivery; there is
no automatic recovery/retry worker. At most four sends run concurrently per process,
with one active send per workflow/webhook. Client disconnection does not cancel a
delivery already reserved; its result is saved for later inspection.

Migration `003_webhook_deliveries.sql` stores attempt IDs, workflow versions,
timestamps, status codes, durations, and fixed error categories. Payloads,
authentication values, receiver bodies, and raw network exceptions are not stored
or returned. Draft setup and full-workflow execution status remain separate from
test-delivery history.

## Save your Muse API key once

From an interactive PowerShell terminal in `backend/`, run:

```powershell
npm.cmd run muse:setup
```

Paste the key from `dev.meta.ai` at the hidden prompt and press Enter. Setup tests
the key, then saves it in Windows Credential Manager under `Metaflow/MuseApiKey`.
It survives closing the terminal, signing out, and restarting the computer for the
same Windows account. It is not saved in repository files, environment variables,
or command history. A failed connection test leaves the previously saved key intact.
The credential belongs to your Windows account on this computer; it is not shared
automatically with teammates or other computers. Processes running as your Windows
account can access it. An explicit `MODEL_API_KEY` environment variable takes
precedence over the saved key when running a test.

After setup, test again without entering the key:

```powershell
npm.cmd run muse:test
```

Run `npm.cmd run muse:setup` again to replace it, or `npm.cmd run muse:forget` to
remove the saved key. Removing it locally does not revoke it on Meta; environment
overrides are also unchanged. `npm.cmd run muse:test:prompt` remains a temporary
test that never saves the entered key.

Using `npm.cmd` on Windows avoids PowerShell script execution-policy errors
without changing policy settings. Saved keys currently require Windows. On other
systems, inject `MODEL_API_KEY` through your secret manager or use
`npm run muse:test:prompt` for a temporary test.

Each setup or test sends one fixed test prompt to
`https://api.meta.ai/v1/responses` using `muse-spark-1.3`, with no automatic retries
and a 1,024 output-token limit. API usage charges may apply. Success prints
`Muse connection successful. Model: muse-spark-1.3.`

This standalone test needs Node.js 24 but no running API server or MySQL database.
It never sends workflow content or displays the key, raw model output, or provider
error bodies. The parsing endpoint uses the same saved credential loader, so it
does not require repeated key entry after successful setup. To verify a real parse
without starting MySQL or an HTTP listener, run `npm.cmd run muse:test:parse`.
This makes one real request through the parse handler with a fixed example, checks
the resulting draft, and reports only node/edge/suggestion counts. It does not test user uploads.
See the [Meta API quickstart](https://dev.meta.ai/docs/quickstart).

The optional Windows storage check uses only a generated test credential under a
separate random name and removes it afterward:

```powershell
$env:RUN_WINDOWS_CREDENTIAL_TESTS = '1'
node --test tests/credential-store.test.ts
Remove-Item Env:RUN_WINDOWS_CREDENTIAL_TESTS
```

## Secrets and logs

- Keep real secret files outside `C:\xampp\htdocs` and outside the repository.
  The app does not automatically load `.env` files; inject configuration through
  the process environment or an external secret store.
- `.env.example` documents empty placeholders. `.env*`, logs, and build output
  are ignored by Git. Never use a `VITE_*` name for a secret.
- Environment variables are accessible to administrators and the running process;
  they are not an encrypted vault.
- Request logs contain only method, route template, status, and request ID.
  Bodies, prompts, query strings, raw database errors, and connection strings
  are not logged. API failures do not return internal exceptions.
- User descriptions and plan content are application data stored in MySQL.
  Do not paste API keys or passwords into workflow content.
- Parsing transmits the submitted description and optional diagram bytes to Meta.
  Original file bytes are held transiently for the request and are not saved by the app.

## Verification

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run test:integration
```

`npm test` runs request validation, graph consistency, origin restrictions,
configuration, parse input/output and graph checks, planning consistency and answer
preservation, mocked Muse API requests, and saved-key
selection/setup/removal behavior. It makes no live Meta requests. The real MySQL
and Windows Credential Manager tests are skipped unless explicitly enabled;
`npm run test:integration` starts a separate password-protected database on a random
loopback port, runs migrations and API checks, and removes its own temporary data.
It does not use `DATABASE_URL` or any existing database. Set `MYSQL_BIN` to the
MySQL server binary directory if it differs from `C:\Program Files\MySQL\MySQL Server 8.0\bin`
on Windows or `/usr/sbin` on Linux. The launcher requires the actual MySQL 8 server,
including its `--initialize-insecure` option; it does not use XAMPP data directories.

Integration checks cover repeated migrations, persistence across new app/pool
instances, immutable history, Unicode JSON round-trips, UTC timestamps, safe SQL parameters,
concurrent save conflicts, migration checksums, and rollback after insert failures.
The complete parse → plan → review → save → update → reopen path is also checked
against real MySQL using simulated Muse responses. It covers reviewed setup,
webhook mappings, answered questions, canvas positions, failed planning, rejected
edits, and immutable saved versions without spending Meta credits.
CI runs these database checks against a disposable MySQL 8.4 service container.


## Workflow execution and self-healing

Migration `004_workflow_runs.sql` adds durable, revisioned run records linked to
immutable workflow versions. Start requires a clean, complete, saved workflow.
The API returns 202 immediately; backend work continues across browser navigation.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/workflows/:id/runs` | `{ requestId, expectedVersion, input, autoRepair? }`; create an idempotent run |
| GET | `/api/workflows/:id/runs` | Latest 50 summaries without input values |
| GET | `/api/runs/:runId` | Snapshot, inputs, checkpoint, attempts, outputs, events, and repairs |
| POST | `/api/runs/:runId/cancel` | `{}`; stop after the current operation |
| POST | `/api/runs/:runId/repairs` | `{ requestId, expectedRevision }`; propose a missing-field alias |
| POST | `/api/runs/:runId/repairs/:repairId/reject` | `{ expectedRevision }`; record rejection |
| POST | `/api/runs/:runId/repairs/:repairId/resume` | `{ expectedRevision }`; apply verified alias and resume |

Execution preparation is cached by workflow ID and immutable version, including
across server restarts. Muse receives the prompt, reviewed settings, field
contracts, graph, and webhook payload references; stored endpoint addresses and
credential references are omitted. The structured definition is validated before
any step runs. Preparation uses minimal reasoning and at most 6,144 output tokens;
there is no paid retry. Only unambiguous expression-root prefixes proven by saved
field contracts can be canonicalized. Real nested source fields retain their names.

The interpreter supports one manual trigger, acyclic graphs of at most 40 steps,
validation, copy/constant/text/conditional assignments, binary decisions, and
outgoing webhooks. Conditions use strict scalar types. Data is limited to 32 KB,
field paths forbid prototype keys, and execution never evaluates JavaScript, SQL,
or arbitrary code. Native APIs, incoming receivers, loops, and parallel fan-out
are rejected before side effects. Outgoing delivery retains the destination,
credential, idempotency, and uncertain-outcome protections above. A run can finish
its original saved version even when a newer draft exists.

Missing-field failures can automatically request a proposal when `autoRepair` is
enabled in the run dialog. Repair requests send field paths and types, not private
input values. Muse may propose copying an existing field into the exact missing
path. The backend checks source existence, target absence, data preservation,
prior-step dependencies, and the failed checkpoint. It rejects overwrites, invented
values, changes that invalidate completed validation/decisions, and changes to
endpoints, credentials, graph structure, or business rules. Up to ten proposals
are allowed per run; repair output is capped at 1,536 tokens with no paid retry.

Apply & resume uses optimistic revision checks and creates a new attempt only
for unfinished steps. Completed outputs and external deliveries are not replayed.
Every original failure and decision remains in history. Approved aliases from
successful runs can be reused at the same step in later runs of that version;
existing values always win. New saved versions require fresh preparation.

Unknown deliveries cannot be automatically repaired or resumed. Startup marks
interrupted runs as needing a check and unfinished AI proposals as unavailable;
it never replays external effects or AI requests automatically. Local run data
is application data in MySQL, not log output. Never supply credential values as
workflow input. Context & logs includes execution, context, and repair-decision
views; the separate setup activity feed remains browser-session-only.

The credit-free execution tests cover both branches, transformation rules, cache
reuse, cancellation, duplicate IDs, repair approval/rejection, checkpoint resume,
prior-decision integrity, uncertain outcomes, and restart recovery. Real MySQL/HTTP
integration also checks immutable versions, durable attempts, repair inheritance,
and authenticated delivery without using Meta credits.
