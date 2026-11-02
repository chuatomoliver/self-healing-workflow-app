# Metaflow frontend

## Visual reference

The visual baseline is commit `b7ed7b7` ("Added the final UI for the workflow-app").
Keep its page headings, spacing, sidebar, summary cards, two-column step review,
three-column webhook cards, canvas toolbar, dark execution log, and page footers.
Working backend data replaces sample data without changing that hierarchy.
Draft management, editable settings, answers, and delivery history open from
compact actions and dialogs. Continue prepares graph and setup in one AI request;
subsequent setup updates remain an explicit optional action.
Changes to these layouts should be checked against that reference first.

Saved workflow IDs remain in the URL across stages so a full reload restores the
selected workflow on the canvas, repair, and logs pages as well as the plan.

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
| Canvas | Real backend execution, branch states, step outputs, and editable saved layouts. |
| Self-heal | Real missing-field proposals, verification, approval/rejection, and checkpoint resume. |
| Context & logs | Durable execution, inputs, attempts, outputs, and repair decisions; setup session activity stays separate. |

Navigation to a page does not call Muse. AI requests are made only by explicit
Continue or Update setup with Muse actions. Neither action retries automatically.
Cancellation ignores an aborted result; a request already sent may still use credits.

## Workflow setup

Continue calls `/api/prepare`. Muse supplies operations, fields, settings, mappings,
and saved connection selections alongside the graph. Complete AI setup shows
Configured by Muse without claiming human review or successful execution. Missing
rules, connections, or credentials remain questions. Answer them and use Update
setup with Muse to regenerate; editing each step manually is optional. Service
addresses and credentials are connected once by the backend owner.

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

The Update setup with Muse button posts the current draft to `/api/plan`.
The backend asks Muse for operations, fields, configuration, mappings, and questions
for the same graph. Reviewed steps keep their setup. Existing webhook endpoints
and authentication configuration are retained by the server and excluded from
that AI context. Unknown business rules remain unresolved questions.

Editing or leaving the plan page cancels an active planning request. Invalid
results do not replace the draft. A successful result is still an unsaved draft
until Save draft is used. Manual setup can also be completed without asking Muse
for another plan.

## Execution, repair, and activity

Run workflow opens a source-data dialog for the clean, saved draft. The first run
of each saved version asks Muse to compile a bounded execution definition. The
backend validates it before executing any steps; later runs reuse it. Polling
shows real step states, branch choices, outputs, and persisted events. Stop waits
for the current operation and prevents later steps from running.

The supported runner handles manual input, validation, field assignments, binary
decisions, and outgoing webhooks. Unsupported connectors or operations fail
preparation. It does not evaluate JavaScript or guess vendor API contracts.

The run dialog can enable automatic Muse repair suggestions for missing fields.
Self-heal presents a verified field alias for approval, or an explicit unavailable
result. Apply & resume adds the alias at the failed checkpoint and runs only the
unfinished path. Earlier attempts and deliveries remain intact. Approved aliases
from successful runs can be reused at that step in later runs of the same version.
A repair cannot change a value or invalidate an earlier validation/branch result.

Context & logs reads saved run history and includes execution, context, and repair
decision tabs. Each step retains all attempts. The original input and workflow
version are preserved separately from the latest checkpoint. Workflow and run
IDs remain in the URL across pages and reloads. Setup session activity is shown
separately and remains session-only.

Individual webhook tests retain their separate delivery history. Unknown delivery
outcomes and interrupted runs are never automatically replayed. Incoming event
receivers and native API/OAuth connectors remain unavailable.

## Build checks

```powershell
npm.cmd run lint
npm.cmd run build
```

These commands do not call Muse. Legacy sample/fixture utilities remain isolated
from active pages; their presence does not enable execution or a demo connection.
