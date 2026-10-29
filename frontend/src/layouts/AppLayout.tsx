import type { ReactNode } from 'react'
import { Icon } from '../components/ui/Icon'
import './AppLayout.css'

const steps = [
  'Describe or upload', 'Parse diagram', 'Plan workflow',
  'Run on canvas', 'Self-heal', 'Context & logs',
]

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar" aria-label="Workflow builder">
        <div className="brand">
          <span className="brand-mark"><Icon name="workflow" /></span>
          <div><span className="brand-name">Self-Healing</span><span className="brand-subtitle">Workflow Builder</span></div>
        </div>
        <div className="sidebar-section-label">BUILD YOUR WORKFLOW</div>
        <nav aria-label="Workflow stages">
          <ol className="workflow-steps">
            {steps.map((step, index) => (
              <li key={step} className={`workflow-step ${index === 0 ? 'is-current' : ''}`}
                aria-current={index === 0 ? 'step' : undefined}>
                <span className="step-number">{index + 1}</span>
                <span>{step}</span>
                {index > 0 && <span className="sr-only"> — not available yet</span>}
              </li>
            ))}
          </ol>
        </nav>
        <div className="sidebar-note">
          <Icon name="sparkle" />
          <p>Muse AI<br /><strong>Parse. Plan. Repair.</strong></p>
        </div>
      </aside>
      <main id="main-content" className="main-content">{children}</main>
    </div>
  )
}
