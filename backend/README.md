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
| POST | `/api/parse` | `{ prompt, attachment? }` | `{ draft: WorkflowDraft, model: "muse-spark-1.3" }`; does not save automatically |
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
fragments. They are stored as inert data; no registration, URL fetch, credential
resolution, or workflow execution occurs. Destination allowlisting and private-IP
protection must be implemented with live connectors.

## Frontend behavior

The Plan Workflow screen supports editing the draft name, saving, listing, and
opening drafts. Save updates the URL with `?workflow=UUID`; refreshing that URL
retrieves the draft from MySQL. Opening a draft resets demo playback and
session history. The original prompt and parsed diagram are saved. Original file
bytes, canvas layout/name overrides, webhook demo connection states, execution
history, and repair review state are not persisted in this milestone. Applied
repair changes to the plan can be saved from the Plan Workflow screen.

Descriptions and diagrams submitted with Continue are parsed by Muse through
`POST /api/parse`. Direct navigation before submission still offers the labeled
sample. Parsed graphs carry into an initial draft plan; detailed operation setup,
live execution, webhook delivery, and AI repair remain pending. Database features
need no Muse key. Sample execution is disabled for parsed workflows.

## Muse parsing endpoint

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
There are no automatic retries. Calls time out after 90 seconds, and client
disconnects cancel the upstream request when detected. Only one parse runs at a
time per server process. API usage charges may still apply after cancellation.

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
Suggestions can be saved and reopened with the draft. The UI keeps them at Needs
setup and does not allow its sample Connect action to register them or mark them
connected. Endpoint, provider authentication, receiver schemas, and payload mappings
still require review and future live connector setup. No suggestion URL is fetched.

This is extraction plus a draft scaffold, not
detailed AI planning or executable configuration. No database write occurs until
the user saves. A successful new parse resets prior demo state and session history.

Errors include `MUSE_NOT_CONFIGURED` (503), key/access or billing failures (503),
`PARSE_BUSY`/`MUSE_RATE_LIMITED` (429), invalid or rejected AI results (502),
`NO_WORKFLOW_FOUND` (422), and `MUSE_TIMEOUT` (504). Provider bodies, credentials,
and raw exceptions are never returned or logged. Parse failures never return the
sample workflow. See [Meta structured output](https://dev.meta.ai/docs/structured-output)
and [inline file handling](https://dev.meta.ai/docs/file-handling).

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
configuration, parse input/output and graph checks, mocked Muse API requests, and saved-key
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
CI runs these database checks against a disposable MySQL 8.4 service container.
