# Metaflow frontend

The frontend turns your description or diagram into a visual workflow. Review
Muse's plan, edit your message, and inspect runs and repair suggestions.

## Setup

Use Node.js 24 and start the backend first. From `frontend/`, run:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open [Metaflow](http://127.0.0.1:5173). Requests are sent to the backend on port 3001.

## How to use it

1. **Describe the process.** Enter a prompt or upload a diagram.
2. **Review the plan.** Muse identifies the steps and necessary webhooks.
3. **Save your draft.** Select Save & manage drafts before Build on canvas.
4. **Run and review.** Check outputs, logs, and any missing-field repair proposals.

Simple Slack workflows show a message editor and reuse your saved connection.
Webhook suggestions can be reviewed before a service is connected.

## Checks

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run lint
```

See the [project overview](../README.md) and [backend setup](../backend/README.md#setup).
