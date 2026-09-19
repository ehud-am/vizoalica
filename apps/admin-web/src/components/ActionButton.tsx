import type { ButtonHTMLAttributes } from 'react';
import { capabilityById, type CapabilityId } from '../capabilities.js';

/**
 * A button that changes state. It must name a capability from the matrix so the view/manage
 * separation can be verified (and later enforced) by capability instead of by screen layout.
 */
export function ActionButton({
  capability,
  type = 'button',
  ...props
}: { capability: CapabilityId } & ButtonHTMLAttributes<HTMLButtonElement>) {
  if (!capabilityById(capability)) throw new Error(`Unknown capability: ${capability}`);
  return <button type={type} data-capability={capability} {...props} />;
}
