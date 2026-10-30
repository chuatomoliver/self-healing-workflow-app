import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router'
import { Icon } from '../components/ui/Icon'
import { workflowStages } from '../app/navigation'

const stepClasses = 'flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] transition-colors duration-200 motion-reduce:transition-none md:gap-3 md:p-3 md:text-xs'

export function AppLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const stage = workflowStages.find((item) => item.path === pathname)
    document.title = `${stage?.label ?? 'Workflow Builder'} | Metaflow`
    mainRef.current?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="min-h-svh md:grid md:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]">
      <a className="fixed -top-20 left-4 z-10 rounded-md border border-accent bg-surface p-3 text-accent focus:top-3" href="#main-content">Skip to content</a>
      <aside className="flex flex-col border-b border-line bg-surface px-5 pt-5 md:sticky md:top-0 md:h-svh md:border-r md:border-b-0 md:px-3.5 md:pt-9 md:pb-6 xl:px-5" aria-label="Workflow builder">
        <div className="flex items-center gap-3 md:px-2">
          <span className="grid h-9 w-8 place-items-center rounded-[10px] bg-accent text-white md:h-10.5 md:w-9.5"><Icon name="workflow" width="25" height="25" /></span>
          <div>
            <span className="block text-base font-bold tracking-[-0.5px] md:text-[17px]">Metaflow</span>
            <span className="mt-px block text-xs text-muted">Workflow Builder</span>
          </div>
        </div>
        <div className="mx-3 mt-13 mb-4 hidden text-[9px] font-semibold tracking-[1.3px] text-muted md:block">BUILD YOUR WORKFLOW</div>
        <nav aria-label="Workflow stages">
          <ol className="flex gap-2 overflow-x-auto pt-5 pb-3.5 md:grid md:gap-2 md:overflow-visible md:p-0">
            {workflowStages.map((step, index) => {
              const isActive = pathname === step.path
              const content = <>
                <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${isActive ? 'bg-accent text-white' : 'bg-[#f0f1f3]'}`}>{index + 1}</span>
                <span>{step.label}</span>
              </>

              return <li key={step.label} className="relative shrink-0">
                {step.path !== null
                  ? <NavLink to={step.path} end aria-current="step"
                    className={`${stepClasses} ${isActive ? 'bg-accent-soft font-semibold text-accent' : 'text-muted hover:bg-slate-50 hover:text-ink'}`}>
                    {content}
                  </NavLink>
                  : <span className={`${stepClasses} text-muted`} aria-disabled="true">
                    {content}<span className="sr-only"> — not available yet</span>
                  </span>}
              </li>
            })}
          </ol>
        </nav>
        <div className="mx-3 mt-auto mb-5 hidden pt-10 text-muted md:block">
          <Icon name="sparkle" className="mb-2 w-5 text-accent" />
          <p className="text-[11px] leading-[1.8]">Muse AI<br /><strong className="font-medium text-ink">Parse. Plan. Repair.</strong></p>
        </div>
      </aside>
      <main ref={mainRef} id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl px-5 pt-6 pb-8 focus:outline-none md:px-7.5 md:pt-8 xl:px-13 2xl:pt-12">{children}</main>
    </div>
  )
}
