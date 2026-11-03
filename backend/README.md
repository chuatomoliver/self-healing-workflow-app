# Metaflow backend

The backend handles Muse planning, saved workflows, execution, webhook delivery,
and missing-field repair proposals. It uses Node.js 24, Fastify, and MySQL or
XAMPP's MariaDB.

## Setup

Start **MySQL** in XAMPP, then run these commands from `backend/`:

```powershell
npm.cmd ci
npm.cmd run dev
```

The default XAMPP root account with no password is used locally. The app creates
its database and tables automatically. Custom database settings can be supplied
through `DATABASE_URL`; other options are documented in [.env.example](.env.example).

The API runs at [127.0.0.1:3001](http://127.0.0.1:3001/api/health).

## Muse and connections

Run `npm.cmd run muse:setup` once to save your Muse API key locally.

Muse identifies necessary webhooks without requiring URLs or credentials to
produce a plan. Live delivery uses saved connections. For a simple Slack workflow,
use Connection options in Plan Workflow to save its webhook once.

Self-healing proposes missing-field mappings for approval. Validated execution
setup is reused for later runs of the same saved version.

## Deployment

The hosted demo runs as a single Node.js 24 web service on Render, built from the
`prod` branch (fast-forwarded by CI after checks pass on `main`), with an external
MySQL-compatible database over `DATABASE_URL` and `DATABASE_SSL`. Use HTTPS in front
of the backend. From the repository root,
install with `npm ci`, build with `npm run build`, and start with `npm start`. The backend serves
`frontend/dist` and `/api` on one domain; page refreshes keep working.

Set `NODE_ENV=production`, `APP_ORIGIN=https://your-domain`, `DATABASE_URL`,
`MODEL_API_KEY`, `DEMO_USERNAME`, and a unique `DEMO_PASSWORD` (16+ characters).
The hosted database must exist; tables are migrated at startup. `PORT` is supplied
by the host; `HOST` defaults to `0.0.0.0`. Keep the app port behind the HTTPS proxy.

Use host environment variables or a private `backend/.env` generated during
deployment. Never publish that file, put secrets in `VITE_*`, or log its contents.
For GitHub Secrets, use the [Muse secret handoff](../.github/actions/muse-env/README.md)
in the tech lead's deployment job; the included manual workflow checks loading only.
The browser asks for the demo login. Everyone shares workflows and run history;
this is a single demo workspace, not separate user accounts. Request limits are
per server process, so run one instance for this demo.

Windows-saved Muse/Slack credentials do not transfer. For Slack, provision
`WEBHOOK_CONNECTIONS_FILE` on persistent private storage and its matching
`WEBHOOK_SECRET_<reference>` in the host environment; allow `https://hooks.slack.com`
in `WEBHOOK_ALLOWED_ORIGINS`. The in-app Slack setup currently uses Windows.

## Checks

```powershell
npm.cmd run check
npm.cmd test
```

See the [project overview](../README.md) and [frontend guide](../frontend/README.md).
