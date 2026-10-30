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
- `npm test`: check input validation and demo branch, failure, and stop behavior using Node's test runner.
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
- `src/features/canvas/`: editable canvas, step inspector, and sample run playback.
- `src/features/healing/`: failed-run context, repair review, verification, and local replay.
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
prompt and selected file remain available while moving between pages.

`features/workflows/data/samplePlan.ts` enriches the example diagram's stable
node IDs and edges with proposed operations, configuration, inputs/outputs,
mappings, webhook suggestions, open questions, and sample review states. The
components receive a typed frontend view model; this JSON is not an executable
workflow-engine definition or a finalized REST API response schema.

Selecting a proposed step updates its detail panel. Inspect related step links
an open question to that panel. The unresolved urgency rule is carried over from
diagram review rather than filled with an invented business rule. Plan checks
explicitly distinguish missing inputs, pending review/setup, and validation
that has not run.

`data/sampleWebhooks.ts` contains incoming support-intake and outgoing on-call /
support-queue templates. Each typed template includes a stable ID, direction,
event, method, endpoint placeholder, authentication reference, payload mappings,
and a sample explanation of why MUSE might suggest it. Steps refer to templates
through `webhookTemplateId`. These are illustrative custom contracts, not native
Email, Slack, or Helpdesk API schemas; a real source or receiver may need an adapter.

Connect applies a template in local UI state immediately and updates its card,
progress count, and linked step details to **Connected**. View template
opens its endpoint / authentication / payload preview and also offers Connect.
The shared `useWebhookConnections` hook owns this simulated operation above the
routes, so it survives sidebar and Back/Forward navigation. Reloading resets it.
It makes no network requests and does not register, test, or send webhook events.
All example URLs use `.invalid`; secret references contain names, not credentials.
The structured plan remains unchanged when local connection state changes.

For REST integration, validate MUSE's suggestions on the backend, then replace
the hook's demo operation with a backend-confirmed connection result. The backend
must provision incoming URLs and configure source subscriptions where supported;
outgoing hooks need the owner's configured receiver URL and server-held secrets.
Do not infer real endpoint URLs or credentials from AI-generated text. Mark a
connection live only after the backend confirms setup. Live webhook setup and
execution checks remain pending even after all demo templates are connected.

The structured JSON section is collapsible. Build on canvas opens
`/run-on-canvas`. No Muse calls, backend changes, database writes, or live workflow
execution are included in this feature.

## Run on Canvas

Open `/run-on-canvas` from Plan Workflow or the sidebar, or directly to inspect
the sample. The existing React Flow dependency renders draggable steps, directed
branch paths, zoom controls, and a minimap. Select a node or use the Selected step
dropdown to inspect it. The inspector can apply a display name (1–80 trimmed
characters), show field mappings and sample output, and open the same webhook
template dialog used by planning. Adding/removing steps or rewiring paths is not
implemented. Reset layout restores positions without changing display names.

`useCanvasDraft` owns canvas names and positions above the routes, alongside
the webhook connection state. These survive navigation; reloading resets them.
Canvas name changes are local display overrides and do not modify the source plan.
The canvas page loads through a separate JavaScript chunk.

`data/sampleScenarios.ts` supplies urgent-success, standard-success, and
urgent-delivery-failure fixtures for the support-triage example. Run workflow plays
these results with per-step states, sample output, highlighted paths, and a log.
The input selects a branch explicitly; it never infers or resolves the live
urgency rule. Demo playback works before webhook setup because no external
services are contacted. HTTP codes are illustrative fixtures.

`demoPlayback.ts` creates immutable playback frames and stops at a failure.
`useDemoRun` schedules the frames and supports Stop. Run state now lives above
the routes so its terminal result remains available for repair review. Leaving
the canvas during playback stops that run. Starting a new run replaces the log
and invalidates the previous repair review. Layout/name changes are disabled
during playback. A failed run enables Review repair / Continue to self-heal.

The future REST integration should supply validated canvas data and actual
execution events instead of fixtures. Demo statuses are not proof of connected
live endpoints, successful delivery, or a runnable workflow.

## Self-heal

`/self-heal` is available through the sidebar and failed canvas runs. Without a
failed run it shows an empty state. To inspect the full frontend flow, select
Urgent request · delivery failure on the canvas, run it, then select Review repair.

The current repair is bounded to the fixture's on-call webhook HTTP 400 error:
the receiver expects `title` rather than `heading`. `repair.ts` builds the original
payload from the failed run's upstream values and the webhook template. The page
shows the error response/events, before/after payloads, receiver contract, and
mapping change. It offers no invented proposal for unsupported failures.

Verify repair checks required string fields, the renamed value, preservation of
other fields, and template/mapping consistency. Apply repair & resume remains
disabled until these checks pass. Applying also rejects stale plan mappings or a
different current run. The local plan updates only the affected step mapping and
webhook payload template, leaving other steps and connection states intact.
Replay preserves the earlier successful steps and skipped branch, then plays only
the failed delivery. Subsequent fixture runs honor the applied field rename.

Reject & keep editing preserves the original configuration and returns to the
canvas. The rejected review can be reopened. Verification, decisions, the current
run, and plan updates survive navigation for this session; reloading resets them.
Self-heal is a separately loaded page; Context & logs remains unavailable.

These are frontend fixtures and local checks, not MUSE output, sandbox execution,
or live webhook delivery. No API requests, secrets, database writes, automatic
repair policies, or deployments are implemented. For REST integration, replace
the proposal/contract fixtures with validated responses and versioned server-side
verification, patch, and replay results. Keep this implementation context out of
the product's visible UI wording.

Development/demo terminology stays in source names, comments, and documentation.
The interface uses normal workflow labels; those wording changes do not enable
live connections or execution.

When deploying this SPA, configure the frontend host to serve `index.html` for
client routes such as `/parse-diagram`, `/plan-workflow`, `/run-on-canvas`, and `/self-heal`. Vite handles this
during local development.
