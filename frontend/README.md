# Metaflow frontend

React + TypeScript with Vite, Tailwind CSS, and React Flow. Active pages use the
current parsed or saved workflow. They do not import a default sample plan,
sample diagram, sample run, or sample repair contract.

## Development

Use Node.js 24. From this directory:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to the backend on port `3001`.
Use `npm` instead of `npm.cmd` on macOS/Linux. See the [backend guide](../backend/README.md)
for database and Muse key configuration.

## App flow

| Page | Source and behavior |
| --- | --- |
| Describe or Upload | User description and optional PNG/JPG/PDF. No predefined template is inserted. |
| Parse Diagram | Validated backend/Muse result, saved diagram, or an empty/loading/error state. |
| Plan Workflow | Current draft, explicit detailed AI planning, editable setup, and saved-draft controls. |
| Canvas | Current steps and connections with editable names and positions. No sample execution playback. |
| Self-heal | Current workflow context and an honest empty state until real failure data is available. |
| Context & logs | Actual session parsing, planning, configuration, save, and open actions. No invented execution records. |

Navigation to a page does not call Muse. AI requests are made only by explicit
Continue or Generate detailed plan actions. Neither action retries automatically.
Cancellation ignores an aborted result; a request already sent may still use credits.

## Workflow setup

Edit step setup allows changes to the name, operation, description, input/output
fields, configuration settings, and source/target mappings. Missing settings remain
marked Needs input until the user resolves them. A step can be marked reviewed
only when its required setup is complete. IDs and graph roles are preserved.

Webhook Configure allows changes to its name, event, purpose, intended HTTPS
address, authentication method/header/reference name, and payload field references.
Actual secrets are not entered in the reference field. Endpoint, authentication,
and payload review are recorded separately. Configuration never registers or tests
a webhook and never marks it Connected.

Payload changes update the linked step's mappings. Changing mappings invalidates
payload review; changing webhook settings invalidates affected step review.
The plan's progress and checks are derived from current setup and question answers,
not fixed example values. An answered question invalidates its related step's review.

Apply to draft changes local state. Save draft stores the current plan, diagram,
step settings, webhook review flags, question answers, names, and canvas positions
through the backend. Original uploaded file bytes are not persisted.

## Detailed planning with Muse

The separate Generate detailed plan button posts the current draft to `/api/plan`.
The backend asks Muse for operations, fields, configuration, mappings, and questions
for the same graph. Reviewed steps keep their setup. Existing webhook endpoints
and authentication configuration are retained by the server and excluded from
that AI context. Unknown business rules remain unresolved questions.

Editing or leaving the plan page cancels an active planning request. Invalid
results do not replace the draft. A successful result is still an unsaved draft
until Save draft is used. Manual setup can also be completed without asking Muse
for another plan.

## Execution, repair, and activity

Live execution and AI repair are not implemented in this phase. Run workflow is
disabled; no run, output, delivery status, or repair proposal is fabricated.
The repair page shows the current workflow and setup counts, but sends no AI request
without a genuine failed-run service.

Context & logs lists actual app actions with timestamps, status, workflow name,
and filters. This activity is session-only and resets on reload. It is distinct
from future durable execution and repair history.

## Build checks

```powershell
npm.cmd run lint
npm.cmd run build
```

These commands do not call Muse. Legacy sample/fixture utilities remain isolated
from active pages; their presence does not enable execution or a demo connection.
