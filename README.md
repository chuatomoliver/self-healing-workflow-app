# Metaflow

Metaflow turns a description or diagram into a visual workflow. Muse AI prepares
the steps, rules, field mappings, and suggested webhook connections for you.

## How to use it

1. **Describe the process.** Explain what starts it, the information it receives, and what should happen. Add a PNG, JPG, or PDF diagram if useful.
2. **Select Continue.** Muse builds a proposed workflow and fills in its setup. Check the diagram and answer any missing details.
3. **Save your draft.** You can reopen it later with its settings and layout.
4. **Run it on the canvas.** Supply the source data. The canvas shows completed, failed, and skipped steps, with their actual outputs.
5. **Review a repair if needed.** Muse can suggest a missing-field mapping. Check the proposal, then apply it to resume from the failed step. Completed deliveries are kept.
6. **Open Context & logs.** Inspect saved runs, original inputs, step attempts, outputs, and repair decisions. This history survives reloading.

## Connecting services

The backend owner connects each outgoing service once. Muse can reuse that saved
connection in future prompts. Credentials stay on the backend. You can also test
an individual outgoing webhook and inspect its real delivery result.

## Muse usage

Continue, Update setup with Muse, first-time execution preparation for a saved
version, and repair suggestions use Meta credits. Later runs reuse the prepared
execution. Reviewing, saving, opening logs, and applying an approved repair make
no additional AI request. There are no automatic paid retries.

Successful approved field aliases can be reused by later runs of the same saved
version. Repairs cannot overwrite data or invalidate completed decisions. An
uncertain delivery needs a receiver check before starting another run.

## What can run today?

Manual-input workflows with validation, field transformations, decisions, and
outgoing webhooks. Incoming event receivers, native app/OAuth connectors, loops,
parallel execution, and shared team access are still being built. Unsupported
steps are reported before execution starts.

For installation, see the [setup guide](backend/README.md#setup). More details are
available in the [app guide](frontend/README.md) and [backend guide](backend/README.md).
