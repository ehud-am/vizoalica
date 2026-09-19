import type { ReactNode } from 'react';

/** Visually separated home for actions that remove or stop things; never mixed with routine ones. */
export function DangerZone({
  target,
  description,
  children
}: {
  target: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="danger-zone" aria-label={`Danger zone for ${target}`}>
      <h3>Danger zone</h3>
      <p>{description}</p>
      <div className="actions">{children}</div>
    </section>
  );
}
