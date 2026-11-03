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

## Checks

```powershell
npm.cmd run check
npm.cmd test
```

See the [project overview](../README.md) and [frontend guide](../frontend/README.md).
