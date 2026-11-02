# Metaflow

Metaflow helps you turn a description or diagram into a visual workflow. Explain
what you want to happen, and Muse AI helps identify the steps, how they connect,
and where webhooks could help services pass information to one another.

For example: “When a new order arrives, create a sales record and notify the team.”
Metaflow turns that idea into a proposed workflow for you to review.

## How to use it

1. **Describe your workflow.** Explain what starts the process and what should happen next.
2. **Add a diagram if you have one.** You can use a PNG, JPG, or PDF up to 10 MB.
3. **Select Continue.** Muse reads your description and diagram and suggests a workflow structure.
4. **Set up the workflow.** Review the steps, edit their settings, answer open questions, and configure suggested webhooks. You can also ask Muse for a detailed plan.
5. **Save your draft.** Give it a name so you can reopen it later.

Saved drafts keep your description, diagram structure, and plan. Original uploaded
files and run history are not saved.

## About webhook suggestions

Muse can suggest where an outside service should send or receive information,
explain why it would help, and propose what information to include.

Suggestions are labeled **Suggested by Muse** and **Needs setup**. Open Configure
to enter the planned address, authentication reference, and payload fields. Reviewed
configuration is labeled **Configured · not tested**; it does not mean services are connected.

## Using Muse AI

Muse needs an access key configured on the computer running Metaflow. On Windows,
the key can be saved once and reused after restarting the computer.

Selecting Continue sends your description and optional diagram to Muse. This uses
your Meta AI credits or paid allowance. Generating a detailed plan is a separate,
explicit AI action. Opening pages, editing setup, and saving drafts do not call Muse.

## What is still being built?

Metaflow currently helps you understand and prepare workflows. Automatically
running your workflows, delivering real webhooks, repairing failed runs with AI,
and sharing access with a team are still in progress. Pages show your current workflow
and actual session activity; they do not load sample runs or repair results.

For installation and configuration, see the [setup guide](backend/README.md#setup).
More detailed guides are available for the [app](frontend/README.md) and
[backend services](backend/README.md).
