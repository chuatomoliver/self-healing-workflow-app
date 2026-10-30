# Metaflow

Metaflow Workflow Builder.

## Current setup

The `frontend/` directory contains the React + TypeScript application, built with
Vite and styled with Tailwind CSS.
The frontend currently includes Describe or Upload, Parse Diagram, Plan Workflow,
and Run on Canvas. Diagram interpretation and workflow planning use typed example
data. The canvas supports local layout/name edits and sample execution playback;
Muse integration, live execution, and persistence will be added separately.
Plan Workflow includes suggested webhook templates with one-click demo connection
states. No live webhook registrations or deliveries are performed.

## Run locally

Use Node.js 24 and npm. From the repository root:

```powershell
cd frontend
npm ci
npm run dev
```

Open the local URL printed by Vite in your browser.

## Check the frontend

Run these commands from `frontend/`:

```powershell
npm run lint
npm test
npm run build
```
