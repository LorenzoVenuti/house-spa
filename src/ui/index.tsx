import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

type Tone = 'neutral' | 'success' | 'danger';

export function AppShell({ children }: { children: ReactNode }) {
  return <div className="app-shell">{children}</div>;
}

export function Topbar({ title = 'Milli e Misfatti', meta, children }: { title?: string; meta?: string; children?: ReactNode }) {
  return (
    <header className="topbar">
      <a className="topbar__brand" href="/today" aria-label="Vai alla pagina Oggi">
        <span className="topbar__mark" aria-hidden="true">MM</span>
        <span>
          <span className="topbar__title">{title}</span>
          {meta ? <span className="topbar__meta">{meta}</span> : null}
        </span>
      </a>
      {children}
    </header>
  );
}

export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <main className={`page ${className}`.trim()}>{children}</main>;
}

export function PageHeader({ eyebrow, title, intro, actions }: { eyebrow?: string; title: string; intro?: string; actions?: ReactNode }) {
  return (
    <div className="page__header">
      <div>
        {eyebrow ? <p className="page__eyebrow">{eyebrow}</p> : null}
        <h1 className="page__title">{title}</h1>
        {intro ? <p className="page__intro">{intro}</p> : null}
      </div>
      {actions ? <div className="cluster">{actions}</div> : null}
    </div>
  );
}

export function Card({ children, title, subtitle, className = '', quiet = false }: { children: ReactNode; title?: string; subtitle?: string; className?: string; quiet?: boolean }) {
  return (
    <section className={`card${quiet ? ' card--quiet' : ''}${className ? ` ${className}` : ''}`}>
      {title || subtitle ? (
        <div className="card__header">
          <div>
            {title ? <h2 className="card__title">{title}</h2> : null}
            {subtitle ? <p className="card__subtitle">{subtitle}</p> : null}
          </div>
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({ label, value, detail, accent = false }: { label: string; value: ReactNode; detail?: ReactNode; accent?: boolean }) {
  return <div className={`stat${accent ? ' stat--accent' : ''}`}><span className="stat__label">{label}</span><strong className="stat__value">{value}</strong>{detail ? <span className="stat__detail">{detail}</span> : null}</div>;
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`pill${tone !== 'neutral' ? ` pill--${tone}` : ''}`}>{children}</span>;
}

export function Button({ children, variant = 'default', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' | 'quiet' }) {
  return <button className={`button${variant !== 'default' ? ` button-${variant}` : ''}${className ? ` ${className}` : ''}`} {...props}>{children}</button>;
}

export function Field({ label, hint, error, id, children }: { label: string; hint?: string; error?: string; id?: string; children?: ReactNode }) {
  const fieldId = id ?? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return <label className="field" htmlFor={fieldId}><span className="field__label">{label}</span>{children ?? <input id={fieldId} className="field__control" aria-invalid={Boolean(error)} />}{hint && !error ? <span className="field__hint">{hint}</span> : null}{error ? <span className="field__hint text-danger" role="alert">{error}</span> : null}</label>;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`field__control${props.className ? ` ${props.className}` : ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`field__control${props.className ? ` ${props.className}` : ''}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`field__control${props.className ? ` ${props.className}` : ''}`} />;
}

export function EmptyState({ icon = '§', title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-state__icon" aria-hidden="true">{icon}</span><h2 className="empty-state__title">{title}</h2>{children ? <p className="empty-state__text">{children}</p> : null}{action}</div>;
}

export function BottomNav({ current }: { current?: string }) {
  const items = [
    ['today', 'Oggi', '⌂'],
    ['calendar', 'Calendario', '▦'],
    ['tribunal', 'Tribunale', '⚖'],
    ['market', 'Mercato', '↔'],
    ['milli', 'Milli', '₥'],
  ];
  return <nav className="bottom-nav" aria-label="Navigazione principale">{items.map(([route, label, icon]) => <a className="bottom-nav__item" key={route} href={`/${route}`} aria-current={current === route ? 'page' : undefined}><span className="bottom-nav__icon" aria-hidden="true">{icon}</span><span>{label}</span></a>)}</nav>;
}

export function CalendarDay({ date, label, today = false, children }: { date: ReactNode; label: string; today?: boolean; children?: ReactNode }) {
  return <article className={`calendar__day${today ? ' calendar__day--today' : ''}`}><div className="calendar__date"><span>{label}</span><span>{date}</span></div><div className="calendar__items">{children}</div></article>;
}

export function CalendarItem({ children, tone = 'gold' }: { children: ReactNode; tone?: 'gold' | 'teal' | 'danger' }) {
  return <div className={`calendar__item calendar__item--${tone}`}>{children}</div>;
}
