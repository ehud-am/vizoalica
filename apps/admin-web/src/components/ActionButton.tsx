import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { capabilityById, type CapabilityId } from '../capabilities.js';
import type { AvailabilityContext } from '../setup/availability.js';
import { useAvailability } from '../setup/useAvailability.js';

/** The reason a control is unavailable, and where to go about it. Never conveyed by color alone. */
function Reason({
  id,
  reason,
  next
}: {
  id: string;
  reason: string;
  next?: { label: string; href: string };
}) {
  return (
    <span id={id} className="control-reason">
      <span aria-hidden="true">ⓘ </span>
      {reason}
      {next && (
        <>
          {' '}
          <a href={next.href}>{next.label}</a>
        </>
      )}
    </span>
  );
}

/**
 * A button that changes state. It must name a capability from the matrix so the view/manage
 * separation can be verified (and later enforced) by capability instead of by screen layout.
 * When the current connection or role cannot do it, the button stays in place, focusable, says
 * why, and never runs its handler.
 */
export function ActionButton({
  capability,
  context,
  type = 'button',
  onClick,
  disabled,
  ...props
}: {
  capability: CapabilityId;
  context?: AvailabilityContext;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  if (!capabilityById(capability)) throw new Error(`Unknown capability: ${capability}`);
  const state = useAvailability(capability, context);
  const reasonId = useId();
  if (state.available)
    return (
      <button
        type={type}
        data-capability={capability}
        {...(onClick ? { onClick } : {})}
        {...(disabled !== undefined ? { disabled } : {})}
        {...props}
      />
    );
  return (
    <>
      <button
        type={type}
        data-capability={capability}
        aria-disabled="true"
        aria-describedby={reasonId}
        // Enter and Space still "click" a focusable control; refusing here also stops form submission.
        onClick={(event) => event.preventDefault()}
        {...props}
      />
      <Reason id={reasonId} reason={state.reason!} {...(state.next ? { next: state.next } : {})} />
    </>
  );
}

/** A link that creates or changes something, held back the same way as an ActionButton. */
export function ActionLink({
  capability,
  context,
  href,
  className,
  children,
  ...props
}: {
  capability: CapabilityId;
  context?: AvailabilityContext;
  href: string;
  className?: string;
  children: ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className'>) {
  if (!capabilityById(capability)) throw new Error(`Unknown capability: ${capability}`);
  const state = useAvailability(capability, context);
  const reasonId = useId();
  if (state.available)
    return (
      <a className={className} href={href} {...props}>
        {children}
      </a>
    );
  return (
    <>
      <button
        type="button"
        data-capability={capability}
        aria-disabled="true"
        aria-describedby={reasonId}
        className={className}
        onClick={(event) => event.preventDefault()}
      >
        {children}
      </button>
      <Reason id={reasonId} reason={state.reason!} {...(state.next ? { next: state.next } : {})} />
    </>
  );
}
