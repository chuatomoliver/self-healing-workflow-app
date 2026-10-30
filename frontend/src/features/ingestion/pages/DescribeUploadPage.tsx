import { useRef } from 'react'
import type { FormEvent } from 'react'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import { DiagramUpload } from '../components/DiagramUpload'
import type { IngestionFormState } from '../hooks/useIngestionDraft'
import { MAX_PROMPT_LENGTH } from '../validation'

const inputPanelClasses = 'min-w-0 rounded-xl border border-line bg-surface p-5 xl:p-6'

const examplePrompt = 'When a new Shopify order comes in, create a deal in HubSpot and post a summary to the #sales channel in Slack.'

type DescribeUploadPageProps = {
  draft: IngestionFormState
  onContinue: () => void
}

export function DescribeUploadPage({ draft, onContinue }: DescribeUploadPageProps) {
  const promptRef = useRef<HTMLTextAreaElement>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const preparedDraft = draft.prepareDraft()
    if (!preparedDraft) promptRef.current?.focus()
    else onContinue()
  }

  return (
    <>
      <div className="text-[9px] font-semibold tracking-[1.5px] text-muted">WORKFLOW BUILDER</div>
      <header className="mt-8 mb-7 md:mt-10 md:mb-8">
        <p className="mb-4 flex items-center gap-2 text-[10px] font-bold tracking-[1.4px] text-accent">
          <span className="size-1.5 rounded-full bg-accent" /> STEP 1 OF 6 · INGESTION
        </p>
        <h1 className="mb-4 text-[clamp(2rem,3.4vw,2.9375rem)] leading-[1.13] font-[650] tracking-[-1.1px] md:tracking-[-1.9px]">
          Describe a workflow,<br className="hidden xl:block 2xl:hidden" /> or show us one.
        </h1>
        <p className="text-xs leading-[1.8] text-muted md:text-[13px]">
          Describe what you want to automate or upload a diagram.
        </p>
      </header>

      <form onSubmit={handleSubmit} noValidate>
        <div className="grid items-stretch gap-4 lg:grid-cols-2 xl:gap-5">
          <section className={inputPanelClasses} aria-labelledby="describe-heading">
            <div className="mb-6 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Icon name="text" className="size-4.5 text-accent" />
                <h2 className="text-sm font-semibold tracking-tight" id="describe-heading">Describe it</h2>
              </div>
              <span className="text-[8px] tracking-[1px] whitespace-nowrap text-muted">PLAIN LANGUAGE</span>
            </div>
            <label className="mb-3 block text-[11px] leading-relaxed text-muted" htmlFor="workflow-prompt">What would you like to automate?</label>
            <div className="relative">
              <textarea ref={promptRef} id="workflow-prompt" name="prompt" value={draft.prompt}
                className="block min-h-52 w-full resize-y rounded-lg border border-slate-200 bg-[#fcfcfd] px-4 pt-4 pb-9 text-xs leading-[1.85] text-ink transition-[border-color,outline-color,box-shadow] duration-200 placeholder:text-[#858a96] focus:border-accent focus:outline-3 focus:outline-offset-0 focus:outline-accent-soft aria-invalid:border-danger motion-reduce:transition-none"
                maxLength={MAX_PROMPT_LENGTH} aria-describedby={`prompt-tip prompt-count${draft.formError ? ' form-error' : ''}`}
                aria-invalid={draft.formError ? true : undefined}
                placeholder={'When something happens in one app,\ndo something in another…'}
                onChange={(event) => draft.updatePrompt(event.target.value)} />
              <span id="prompt-count" className="pointer-events-none absolute right-3 bottom-3 text-[9px] text-muted">{draft.prompt.length.toLocaleString()} / 4,000</span>
            </div>
            <div className="mt-3 flex items-start justify-between gap-2.5 md:max-xl:flex-col md:max-xl:gap-1.5">
              <span id="prompt-tip" className="max-w-44 text-[9px] leading-[1.8] text-muted md:max-xl:max-w-none">Name the apps, the trigger, and the action.</span>
              <Button variant="text" size="inline" onClick={() => { draft.updatePrompt(examplePrompt); promptRef.current?.focus() }}>Use a template <Icon name="arrow" width="13" height="13" /></Button>
            </div>
          </section>

          <section className={inputPanelClasses} aria-labelledby="upload-heading">
            <div className="mb-6 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Icon name="upload" className="size-4.5 text-accent" />
                <h2 className="text-sm font-semibold tracking-tight" id="upload-heading">Upload a diagram</h2>
              </div>
              <span className="text-[8px] tracking-[1px] text-muted">OPTIONAL</span>
            </div>
            <DiagramUpload file={draft.diagram} previewUrl={draft.previewUrl} error={draft.fileError}
              onSelect={draft.selectFiles} onRemove={draft.removeDiagram} />
          </section>
        </div>

        {draft.formError && <p className="mt-5 flex items-center gap-2 text-xs text-danger motion-safe:animate-reveal" id="form-error" role="alert"><Icon name="info" width="17" height="17" className="shrink-0" />{draft.formError}</p>}

        <div className="mt-7 flex justify-end">
          <Button type="submit" className="min-w-36 md:min-w-[133px]">Continue <Icon name="arrow" width="17" height="17" /></Button>
        </div>
      </form>
      <footer className="mt-8 flex items-center justify-between border-t border-line pt-5 text-[8px] tracking-[1.5px] text-muted md:mt-10">
        <span>DESCRIBE OR UPLOAD</span>
        <span className="font-semibold tracking-wide text-accent">01 <span className="mx-2 text-slate-400">/</span> 06</span>
      </footer>
    </>
  )
}
