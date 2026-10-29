# self-healing-workflow-app

Self-Healing Workflow Builder.

## Current setup

The `frontend/` directory contains the React + TypeScript application, built with
Vite and styled with Tailwind CSS.
The frontend currently includes Describe or Upload, Parse Diagram, and Plan
Workflow. Diagram interpretation and workflow planning use typed example data;
Muse integration, the canvas, execution, and persistence will be added separately.

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
