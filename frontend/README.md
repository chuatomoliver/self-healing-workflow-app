# Frontend

React + TypeScript with Vite and Tailwind CSS.

## Development

Use Node.js 24 and npm. Run these commands from this directory:

```powershell
npm ci
npm run dev
```

Vite prints the local development URL after starting.

## Scripts

- `npm run dev`: start the development server with hot module replacement.
- `npm run lint`: check source files with Oxlint.
- `npm test`: check input validation and next-stage selection using Node's test runner.
- `npm run build`: check TypeScript and produce a production build in `dist/`.
- `npm run preview`: serve the production build locally for review.

## Entry points

- `index.html`: browser entry document.
- `src/main.tsx`: React application entry point.
- `src/App.tsx`: application composition.
- `src/layouts/AppLayout.tsx`: workflow sidebar and shared page shell.
- `src/app/navigation.ts`: shared routes and workflow-stage navigation.
- `src/features/ingestion/`: Describe or Upload page, form behavior, and validation.
- `src/features/diagram-parsing/`: diagram review templates and example data.
- `src/features/workflows/`: workflow-plan templates and example configuration.
- `src/index.css`: Tailwind entry point, shared theme tokens, and minimal base styles.

## Styling

Use Tailwind utility classes for layout, responsive behavior, and component states.
The official `@tailwindcss/vite` plugin compiles the styles through Vite. Shared
colors, typography, and the short reveal animation are defined with `@theme` in
`src/index.css`; no separate Tailwind configuration file is needed for this setup.

Reuse `components/ui/Button.tsx` for button variants and sizes, and
`components/ui/Dialog.tsx` for native modal dialogs with keyboard dismissal and
focus restoration. Keep class names
complete and statically discoverable, including conditional variants. Transitions
use `motion-reduce:transition-none`, and entrance animations use `motion-safe`, so
they respect the user's reduced-motion preference. Add future page styles with
utilities instead of a separate page stylesheet.

## Describe or Upload

Accepts a description, a PNG/JPG/PDF diagram, or both. Descriptions are limited to
4,000 characters and diagrams to 10 MB. Files stay local; image thumbnails and
file preview links use temporary object URLs, which are released on replacement,
removal, or unmounting.

For the current interface preview, Continue navigates every valid draft (text,
diagram, or both) to `/parse-diagram`. Empty submissions stay on the first page
with a validation error. The draft's `nextStep` metadata still distinguishes
diagram parsing from text-only planning for later integration, but it does not
control preview navigation. React Router connects the two pages, including browser
Back/Forward and sidebar navigation. The draft and its object URL are owned above
the page routes, so the file and description survive navigation between pages.
Nothing is persisted across a page reload. Client validation is a usability check;
the future backend must validate file content, size, and request data independently.

## Parse Diagram

Open `/parse-diagram` directly or use the sidebar to inspect the sample without
selecting a file. The page shows a support-request example with an urgency branch.
It does not analyze, upload, or infer anything from an attached file.

`features/diagram-parsing/data/sampleDiagram.ts` supplies one typed frontend view
model. The React Flow graph, extracted-node list, extracted-edge list, counts, and
review notes all render from that model. Node selection works from the graph or
the list, including the graph's keyboard selection, and updates the detail panel.
The graph supports pan, zoom, and fit-to-view; it is not an editable workflow yet.

Muse integration will replace the sample with validated results from Laravel's
REST API. The final API schema will be defined during integration; the current
view model includes display positions for the example graph. Confirm & continue
opens the static Plan Workflow page at `/plan-workflow`; this does not save or
approve a workflow on a server.

## Plan Workflow

`/plan-workflow` continues the same support-request scenario. It is reachable from
Parse Diagram or the sidebar, and it can also be opened directly. The original
prompt and selected file remain available while moving between all three pages.

`features/workflows/data/samplePlan.ts` enriches the example diagram's stable
node IDs and edges with proposed operations, configuration, inputs/outputs,
mappings, account requirements, open questions, and sample review states. The
components receive a typed frontend view model; this JSON is not an executable
workflow-engine definition or a finalized REST API response schema.

Selecting a proposed step updates its detail panel. Inspect related step links
an open question to that panel. The unresolved urgency rule is carried over from
diagram review rather than filled with an invented business rule. Plan checks
explicitly distinguish sample data, missing inputs, pending access, and validation
that has not run.

Connection controls open an explanatory dialog with sample access requirements.
They do not start authentication, request permissions, or connect an account.
The structured JSON section is collapsible. Build on canvas is disabled until
the canvas page is implemented. No Muse calls, backend changes, database writes,
or workflow execution are included in this feature.

When deploying this SPA, configure the frontend host to serve `index.html` for
client routes such as `/parse-diagram` and `/plan-workflow`. Vite handles this
during local development.
