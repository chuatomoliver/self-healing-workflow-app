export function WorkflowPageHeading({ step, stage, title, description }: { step: number; stage: string; title: string; description: string }) {
  return <>
    <div className="text-[9px] font-semibold tracking-[1.5px] text-muted">WORKFLOW BUILDER</div>
    <header className="mt-8 mb-7 md:mt-10 md:mb-8">
      <p className="mb-4 flex items-center gap-2 text-[10px] font-bold tracking-[1.4px] text-accent"><span className="size-1.5 rounded-full bg-accent" />STEP {step} OF 6 · {stage}</p>
      <h1 className="mb-4 text-[clamp(1.875rem,3vw,2.625rem)] leading-tight font-[650] tracking-[-1.3px]">{title}</h1>
      <p className="max-w-2xl text-xs leading-[1.8] text-muted md:text-[13px]">{description}</p>
    </header>
  </>
}
export function WorkflowPageFooter({ step, label }: { step: number; label: string }) {
  return <footer className="mt-8 flex items-center justify-between border-t border-line pt-5 text-[8px] tracking-[1.5px] text-muted md:mt-10"><span>{label}</span><span className="font-semibold tracking-wide text-accent">{String(step).padStart(2, '0')} <span className="mx-2 text-slate-400">/</span> 06</span></footer>
}
