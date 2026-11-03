# Muse secret handoff

Create the repository secret **MODEL_API_KEY**, then push these files to the
default branch. In GitHub, open **Actions → Muse secret handoff → Run workflow**
on that branch. This checks secret loading without calling or billing Muse.

For the hosting deployment job, check out the repo, select Node.js 24, and use:

```yaml
- id: muse
  uses: ./.github/actions/muse-env
  with:
    model-api-key: ${{ secrets.MODEL_API_KEY }}
```

The action outputs `${{ steps.muse.outputs.env-file }}`, a private temporary file
containing only `MODEL_API_KEY`. The tech lead's authenticated deployment step
must deliver it to the server's private `backend/.env`, or load its value into
the host's runtime environment, **in the same job before cleanup**. Keep other
backend settings in host environment variables; do not replace an existing
multi-setting `.env` with this key-only file. Restart/redeploy the backend to
load the new value. The existing `npm start` and Muse client already support it.

Copy the final `always()` cleanup step from the workflow into the deployment job.
The file stays outside the checkout; never commit it, print it, or upload it as
a GitHub artifact. Build the frontend before this action, with no Muse secret
in its environment. Keep the backend file outside the public web root.

The provided workflow validates the handoff and removes the temporary file.
It does not upload to the host or check the API key with the Muse service. The demo
runs on Render, which has no GitHub-to-host secret upload here: set `MODEL_API_KEY`
directly in the Render dashboard (see the
[backend deployment guide](../../../backend/README.md#deployment)).
