import type { ReactNode } from 'react';

/** A numbered list of steps. The browser numbers the list, so the order is real, not decoration. */
export function InstallSteps({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ol className="install-steps" role="list" aria-label={label}>
      {children}
    </ol>
  );
}

/** One step: a heading that says what to do, then its explanation and at most one code block. */
export function InstallStep({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="install-step">
      <h3>{title}</h3>
      <div className="step-body">{children}</div>
    </li>
  );
}
