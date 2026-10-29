import { useRef } from 'react'
import type { FormEvent } from 'react'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import { DiagramUpload } from '../components/DiagramUpload'
import { useIngestionDraft } from '../hooks/useIngestionDraft'
import { MAX_PROMPT_LENGTH } from '../validation'
import './DescribeUploadPage.css'

const examplePrompt = 'When a new Shopify order comes in, create a deal in HubSpot and post a summary to the #sales channel in Slack.'
const upcomingStages = [
  { number: '01', title: 'Understand', description: 'Muse reads your description and any diagram you add.' },
  { number: '02', title: 'Plan', description: 'Muse proposes the steps. Review the plan and connect your apps.' },
  { number: '03', title: 'Run', description: 'Edit your workflow on the canvas and put it to work.' },
  { number: '04', title: 'Repair', description: 'If a step breaks, Muse proposes a fix for you to review.' },
]

export function DescribeUploadPage() {
  const draft = useIngestionDraft()
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const noticeRef = useRef<HTMLDivElement>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.prepareDraft()) promptRef.current?.focus()
    else requestAnimationFrame(() => noticeRef.current?.focus())
  }

  return (
    <>
      <div className="page-topline"><span>WORKFLOW BUILDER</span></div>
      <header className="page-header">
        <p className="eyebrow"><span /> STEP 1 OF 6 · INGESTION</p>
        <h1>Describe a workflow,<br className="heading-break" /> or show us one.</h1>
        <p className="page-intro">Start with an idea. Describe what you want to automate, upload a diagram,<br className="intro-break" /> or use both. We’ll help you connect the dots.</p>
      </header>

      <form onSubmit={handleSubmit} noValidate>
        <div className="input-panels">
          <section className="input-panel" aria-labelledby="describe-heading">
            <div className="panel-heading">
              <div className="panel-title"><Icon name="text" /><h2 id="describe-heading">Describe it</h2></div>
              <span className="input-label">PLAIN LANGUAGE</span>
            </div>
            <label className="prompt-label" htmlFor="workflow-prompt">What would you like to automate?</label>
            <div className="textarea-container">
              <textarea ref={promptRef} id="workflow-prompt" name="prompt" value={draft.prompt}
                maxLength={MAX_PROMPT_LENGTH} aria-describedby={`prompt-tip prompt-count${draft.formError ? ' form-error' : ''}`}
                aria-invalid={draft.formError ? true : undefined}
                placeholder={'When something happens in one app,\ndo something in another…'}
                onChange={(event) => draft.updatePrompt(event.target.value)} />
              <span id="prompt-count" className="character-count">{draft.prompt.length.toLocaleString()} / 4,000</span>
            </div>
            <div className="prompt-footer"><span id="prompt-tip">Name the apps, the trigger, and the action.</span>
              <Button variant="text" onClick={() => { draft.updatePrompt(examplePrompt); promptRef.current?.focus() }}>Try an example <Icon name="arrow" width="13" height="13" /></Button>
            </div>
          </section>

          <section className="input-panel" aria-labelledby="upload-heading">
            <div className="panel-heading">
              <div className="panel-title"><Icon name="upload" /><h2 id="upload-heading">Upload a diagram</h2></div>
              <span className="input-label">OPTIONAL</span>
            </div>
            <p className="panel-description">Already mapped it out? Show us what you have.</p>
            <DiagramUpload file={draft.diagram} previewUrl={draft.previewUrl} error={draft.fileError}
              onSelect={draft.selectFiles} onRemove={draft.removeDiagram} />
          </section>
        </div>

        <section className="next-section" aria-labelledby="next-heading">
          <div className="next-section-heading"><h2 id="next-heading">From idea to automation</h2><span className="muse-label"><Icon name="sparkle" width="13" height="13" /> Built around Muse AI</span></div>
          <div className="upcoming-stages">
            {upcomingStages.map((stage) => <div className="upcoming-stage" key={stage.number}>
              <span className="upcoming-number">{stage.number}</span>
              <h3>{stage.title}</h3><p>{stage.description}</p>
            </div>)}
          </div>
        </section>

        {draft.formError && <p className="form-error" id="form-error" role="alert"><Icon name="info" width="17" height="17" />{draft.formError}</p>}
        {draft.readyDraft && <div className="integration-notice" ref={noticeRef} tabIndex={-1} role="status">
          <Icon name="info" />
          <div><strong>{draft.readyDraft.nextStep === 'parse-diagram' ? 'Your diagram is ready for parsing.' : 'Your description is ready for planning.'}</strong>
            <p>Muse integration is not connected yet. Your inputs stay here; no file has been uploaded and no workflow has been generated.</p>
          </div>
        </div>}

        <div className="form-actions">
          <p><Icon name="info" width="15" height="15" /> Add a description, a diagram, or both.</p>
          <div className="continue-action"><span>{draft.diagram ? 'Next: review your diagram' : 'Next: plan your workflow'}</span>
            <Button type="submit">Continue <Icon name="arrow" width="17" height="17" /></Button>
          </div>
        </div>
      </form>
      <footer className="page-footer"><span>DESCRIBE OR UPLOAD</span><span>01 <span className="footer-divider">/</span> 06</span></footer>
    </>
  )
}
