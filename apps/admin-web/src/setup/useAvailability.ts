import type { CapabilityId } from '../capabilities.js';
import { availability, type Availability, type AvailabilityContext } from './availability.js';
import { useSetup } from './SetupProvider.js';

/** Whether a control can be used now for the current connection and role. */
export function useAvailability(
  capability: CapabilityId,
  context?: AvailabilityContext
): Availability {
  const { state } = useSetup();
  return availability(state, capability, context);
}
