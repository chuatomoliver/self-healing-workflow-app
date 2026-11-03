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

The hosted demo runs on a Hostinger KVM VPS with Docker Compose: the app (Node.js 24)
and MySQL 8.4 as two containers, built from the `prod` branch (fast-forwarded by CI
after checks pass on `main`). See [Dockerfile](../Dockerfile),
[docker-compose.yml](../docker-compose.yml), and
[compose.env.example](../compose.env.example). The app is routed by the VPS's existing Traefik
over HTTPS, and the Slack connection catalog is kept on a volume.
Without Docker, use HTTPS in front of the backend. From the repository root,
install with `npm ci`, build with `npm run build`, and start with `npm start`. The backend serves
`frontend/dist` and `/api` on one domain; page refreshes keep working.

The backend serves `frontend/dist` and `/api` on one domain over Render's HTTPS;
page refreshes keep working.

### 1. Database

1. Create a free MySQL-compatible cluster and note its host, port, user, and password.
2. Create an empty database named `metaflow` (letters, numbers, and underscores only).
   Tables are migrated at startup, but the database itself must already exist.
3. Build `DATABASE_URL` as `mysql://USER:PASSWORD@HOST:PORT/metaflow`. URL-encode special
   characters in the password (`@` → `%40`, `#` → `%23`, `/` → `%2F`, `:` → `%3A`).
4. Set `DATABASE_SSL=true` if the provider requires TLS (TiDB Cloud does). It needs a
   certificate from a public CA and the URL must not contain query parameters.

### 2. Render web service

Create a **Web Service** from this repository with these settings:

| Setting        | Value                                                    |
| -------------- | -------------------------------------------------------- |
| Branch         | `prod` (CI fast-forwards it after checks pass on `main`) |
| Root directory | repository root (leave blank)                            |
| Runtime        | Node                                                     |
| Build command  | `npm ci && npm run build`                                |
| Start command  | `npm start`                                              |
| Instance type  | Free                                                     |
| Auto-deploy    | On commit                                                |

Set these environment variables in the Render dashboard (never in the repository):

| Variable        | Value                                                                              |
| --------------- | ---------------------------------------------------------------------------------- |
| `NODE_VERSION`  | `24`                                                                               |
| `NODE_ENV`      | `production`                                                                       |
| `APP_ORIGIN`    | the service's public origin, e.g. `https://metaflow.onrender.com` (HTTPS, no path) |
| `DATABASE_URL`  | from step 1                                                                        |
| `DATABASE_SSL`  | `true` or `false` per step 1                                                       |
| `MODEL_API_KEY` | your Muse key                                                                      |
| `DEMO_USERNAME` | letters, numbers, `_`, `.`, or `-`                                                 |
| `DEMO_PASSWORD` | unique, 16–256 characters                                                          |

`PORT` is supplied by Render and `HOST` defaults to `0.0.0.0`. If you add a custom
domain later, update `APP_ORIGIN` to match and redeploy.

Free instances sleep after about 15 minutes without traffic, so the first request
afterwards takes up to a minute. Run a single instance: request limits are per
server process. Never publish secrets, put them in `VITE_*`, or log them. The
[Muse secret handoff](../.github/actions/muse-env/README.md) is optional here, since
`MODEL_API_KEY` can be set directly in Render.

The browser asks for the demo login. Everyone shares workflows and run history;
this is a single demo workspace, not separate user accounts.

Use **Set up connection** on any outgoing webhook card, including Slack, at any
node count. Save a full URL and optional header token or HMAC secret. Windows uses
Credential Manager; Linux/macOS use owner-only files outside the app, defaulting
to `~/.config/Metaflow/webhook-secrets`. Keep `WEBHOOK_SECRETS_DIR` and
`WEBHOOK_CONNECTIONS_FILE` on persistent private storage; ephemeral hosting loses
these on restart/redeploy. Existing environment credentials still work.
This setup sends JSON over POST to HTTPS webhooks. Incoming receivers, OAuth, and
service-specific payload formats still need their own supported integration.

## Checks

```powershell
npm.cmd run check
npm.cmd test
```

See the [project overview](../README.md) and [frontend guide](../frontend/README.md).
