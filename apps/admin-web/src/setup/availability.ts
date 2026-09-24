import type { SetupState } from '../api/local-operations.js';
import { capabilityById, type CapabilityId } from '../capabilities.js';

export type Availability = {
  available: boolean;
  reason?: string;
  next?: { label: string; href: string };
};

/** What the current screen knows that the setup state does not. */
export type AvailabilityContext = { hasProject?: boolean };

const YES: Availability = { available: true };
const no = (reason: string, next?: Availability['next']): Availability => ({
  available: false,
  reason,
  ...(next ? { next } : {})
});

/** Screens and controls a role can never use are absent, not merely disabled. */
const ADMIN_ONLY_SURFACES: readonly CapabilityId[] = ['manage-access-keys'];
export function isAbsent(state: SetupState | undefined, capability: CapabilityId): boolean {
  const role = state?.principal?.role;
  return role !== undefined && role !== 'admin' && ADMIN_ONLY_SURFACES.includes(capability);
}

/**
 * Whether a control can be used now, and if not, why and where to go. With no setup state (a console
 * that could not ask) nothing is held back; the backend still refuses what it must.
 */
export function availability(
  state: SetupState | undefined,
  capability: CapabilityId,
  context: AvailabilityContext = {}
): Availability {
  const definition = capabilityById(capability);
  if (!state || !definition || definition.class === 'view') return YES;

  const { status } = state.connection;
  if (status === 'unreachable') return no('The backend is not answering. Check it and retry.');
  if (status === 'revoked')
    return no(
      state.principal?.role === 'admin'
        ? 'The saved secret was rejected. Fix it with: vizoalica env update <name>'
        : 'Your access was revoked. Ask your admin for a new key, then run: vizoalica env update <name>'
    );
  if (status === 'incompatible')
    return no(
      'This backend does not work with this console. Update the console (npm update -g vizoalica).'
    );

  const role = state.principal?.role ?? 'admin';
  if (role === 'analyst') return no('Your access is read-only.');
  if (role === 'owner' && definition.class === 'backend')
    return no('Only an admin can change the backend.');
  if (role === 'owner') {
    const scope = state.principal!.scope;
    if (capability === 'create-project' && (scope.projectId !== null || scope.sourceId !== null))
      return no('Your access does not allow creating this here.');
    if (capability === 'add-website' && scope.sourceId !== null)
      return no('Your access does not allow creating this here.');
    if (capability === 'delete-project' && scope.sourceId !== null)
      return no('Your access does not allow deleting this project.');
  }

  if (capability === 'add-website' && context.hasProject === false)
    return no('Create a project first.', { label: 'Create a project', href: '#/manage/projects' });

  if (
    (capability === 'manage-access-keys' || capability === 'share-website-setup') &&
    state.principal?.features.accessKeys === false
  )
    return no('This backend needs an update before it can issue keys.');
  if (state.backend?.worker.status === 'console-older' && definition.class === 'backend')
    return no(
      'This backend is newer than this console. Update the console (npm update -g vizoalica).'
    );
  return YES;
}
