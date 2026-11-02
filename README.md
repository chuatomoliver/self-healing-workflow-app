# Metaflow

Metaflow is a workflow-builder prototype with a React frontend, a local Fastify +
MySQL API for workflow drafts, and standalone Muse API connection tools.

## Current status

| Area | Implemented behavior |
| --- | --- |
| Describe or Upload | Accepts a description and/or a PNG, JPG, or PDF with client-side validation and local previews. |
| Parse Diagram | Shows a typed sample diagram or the diagram structure from a reopened draft. It does not analyze the submitted prompt or file with AI. |
| Plan Workflow | Shows the sample or reopened plan. Supports renaming, saving, listing, and reopening drafts through the backend. |
| Run on Canvas | Supports local layout/name edits and sample execution playback with branch, stop, and failure states. |
| Self-heal | Reviews a sample webhook failure, verifies a proposed field rename, and applies/rejects a local repair with sample replay. |
| Context & logs | Shows run attempts, outputs, original context, and repair decisions for the current session. |
| Backend | Provides health checks and create/list/get/update endpoints backed by MySQL, migrations, immutable draft versions, and save-conflict detection. |
| Muse tools | Tests `muse-spark-1.3` directly and optionally saves the API key in Windows Credential Manager for reuse after restarting. |

**The frontend does not call Muse yet.** Saving a key or passing the connection
test does not enable AI parsing, workflow planning, or repair in the app. Webhook
connections and workflow execution still use demo behavior; no live webhook
registration or delivery occurs.

The backend currently supports local development only. It binds to `127.0.0.1`
and rejects `NODE_ENV=production`. Authentication and workflow ownership are still
needed before shared deployment.

## Project layout

- `frontend/`: React + TypeScript, Vite, Tailwind CSS, and React Flow.
- `backend/`: Node.js 24, TypeScript, Fastify, MySQL persistence, and Muse tools.
- `shared/`: workflow transport types shared by the frontend and backend.
- `.github/workflows/`: frontend/backend checks and disposable MySQL integration in CI.

See the [frontend guide](frontend/README.md) and
[backend setup and API documentation](backend/README.md) for details.

## Run locally

Install Node.js 24, npm, and MySQL 8.0.16 or newer. Create a dedicated empty database
as described in the [backend setup guide](backend/README.md#setup).

These examples use PowerShell and `npm.cmd` to avoid Windows script execution-policy
errors. Use `npm` instead of `npm.cmd` on macOS or Linux. Run each terminal's commands
from the repository root.

Start the backend in the first terminal. Enter your MySQL connection URL at the
hidden prompt; it is required each time you start a new terminal unless supplied
through an external configuration mechanism. The URL format is
`mysql://USER:PASSWORD@HOST:3306/DATABASE`.

```powershell
cd backend
npm.cmd ci
$metaflowConnection = Read-Host 'MySQL connection URL' -AsSecureString
$env:DATABASE_URL = [System.Net.NetworkCredential]::new('', $metaflowConnection).Password
Remove-Variable metaflowConnection
npm.cmd run dev
```

Startup applies the database migrations. The API listens at
`http://127.0.0.1:3001`; `GET /api/health` checks database connectivity.

Start the frontend in a second terminal:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to the backend at port `3001`.
Source files are blocked from direct Apache access by `.htaccess`; use Vite during
development rather than opening the source through XAMPP's Apache server.
The frontend demo and workflow persistence do not require a Muse key.

## Save and reopen workflow drafts

In Plan Workflow, edit the draft name and select Save draft. Use Saved drafts to
reopen a draft, or refresh its `?workflow=UUID` URL. The backend assigns a UUID,
version, and UTC timestamps. Updates create an immutable version; a stale save
returns a conflict instead of overwriting another tab's changes.

| Data | Persistence |
| --- | --- |
| Original description, diagram structure, plan, draft name, and version history | Stored in MySQL when Save draft is used. |
| Applied repair changes to the plan | Can be saved from Plan Workflow. |
| Original uploaded file bytes, canvas layout/name overrides, demo webhook connection state, run history, and repair review state | Session only; not restored after reload. |

Opening a saved draft resets demo playback and session history. Drafts can contain
unresolved configuration; saving does not execute or approve a workflow.

## Set up Muse once on Windows

From `backend/`, run:

```powershell
npm.cmd run muse:setup
```

Paste your key from `dev.meta.ai` into the hidden prompt and press Enter. Setup
makes one connection test, then saves the key in Windows Credential Manager under
`Metaflow/MuseApiKey` only if the test succeeds. The saved key survives terminal
closure, sign-out, and restart for the same Windows account on the same computer.
Each teammate or computer needs its own setup; this does not distribute the key.

| Command from `backend/` | Purpose |
| --- | --- |
| `npm.cmd run muse:setup` | Test and save a key, or replace the saved key. |
| `npm.cmd run muse:test` | Test using `MODEL_API_KEY` if supplied, otherwise the saved key. |
| `npm.cmd run muse:test:prompt` | Test an entered key temporarily without saving it. |
| `npm.cmd run muse:forget` | Remove the saved local key; does not revoke it on Meta. |

Setup and tests send a fixed prompt to `https://api.meta.ai/v1/responses` using
`muse-spark-1.3`, with one request, no retries, and a 1,024 output-token limit.
API usage charges may apply. These commands work without a running backend or
database. They do not send workflow content or connect the frontend to Muse.

Keep real keys out of chat, repository files, and `VITE_*` variables. The app does
not load `.env` files automatically. Other operating systems can supply
`MODEL_API_KEY` through their own secret manager or use the temporary prompt.
See the [backend Muse guide](backend/README.md#save-your-muse-api-key-once).

## Verification

From `backend/`:

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run test:integration
```

The default tests cover validation, API behavior, safe errors, mocked Muse requests,
and saved-key behavior without calling Meta. Real MySQL integration uses a separate
temporary database and requires MySQL server binaries; see the backend guide for
`MYSQL_BIN` configuration. The optional Windows Credential Manager test uses a fake
credential under a random test name and removes it afterward.

From `frontend/`:

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

CI runs the frontend checks, backend type checks and unit tests, and database
integration against a disposable MySQL 8.4 service. Live Muse tests are manual.

## Remaining integration work

- Connect frontend descriptions and diagram uploads to validated Muse parsing and planning responses.
- Add live workflow execution, webhook provisioning/delivery, and server-side repair verification/replay.
- Persist execution history and audit events beyond the current frontend session.
- Add authentication and workflow ownership before shared hosting.
