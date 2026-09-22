import type { RoleHint } from '../connection-store.js';

export type ViewRole = 'admin' | 'owner' | 'analyst';
export type StageId = 'console' | 'backend' | 'website' | 'data';
export type StageStatus = 'done' | 'current' | 'todo' | 'blocked';
export type ConnectionStatus = 'none' | 'connected' | 'unreachable' | 'revoked' | 'incompatible';
export type NextAction = { id: string; label: string; href?: string };
export type Stage = { id: StageId; label: string; status: StageStatus; next?: NextAction };

export type StageInput = {
  connection: ConnectionStatus;
  role: ViewRole;
  /** Whether the credential's scope lets it create a website (an owner key limited to one website cannot). */
  canCreate: boolean;
  websites: number;
  firstWebsiteId?: string | undefined;
  dataArriving: boolean;
};

const LABELS: Record<StageId, string> = {
  console: 'Console running',
  backend: 'Backend connected',
  website: 'Website configured',
  data: 'Data arriving'
};

/** Before a backend answers, the remembered first-run choice is the best guess at who this is. */
export function viewRole(actual: ViewRole | undefined, hint: RoleHint | undefined): ViewRole {
  if (actual) return actual;
  return hint === 'website-owner' ? 'owner' : hint === 'analyst' ? 'analyst' : 'admin';
}

export function roleFromBackend(role: 'admin' | 'analyst' | 'owner'): RoleHint {
  return role === 'owner' ? 'website-owner' : role;
}

function backendAction(input: StageInput): NextAction {
  const href = '#/setup';
  if (input.connection === 'unreachable')
    return {
      id: 'check-backend',
      label: 'The backend is not answering. Check it and retry.',
      href
    };
  if (input.connection === 'incompatible')
    return {
      id: 'update-console',
      label:
        'This backend does not work with this console. Update the console: npm update -g vizoalica'
    };
  if (input.connection === 'revoked')
    return {
      id: 'reconnect',
      label:
        input.role === 'admin'
          ? 'The backend rejected the saved credential. Enter the administrator secret again.'
          : 'Your access was revoked. Ask your admin for a new key.',
      href
    };
  if (input.role === 'owner')
    return { id: 'enter-setup-details', label: 'Enter the setup details you were given', href };
  if (input.role === 'analyst')
    return { id: 'enter-access-key', label: 'Enter the access key you were given', href };
  return { id: 'connect-backend', label: 'Deploy or connect a backend', href };
}

function websiteAction(input: StageInput): NextAction {
  if (input.role === 'admin')
    return {
      id: 'create-project',
      label: 'Create a project and add a website',
      href: '#/manage/projects'
    };
  if (input.role === 'owner')
    return input.canCreate
      ? { id: 'add-website', label: 'Add your website', href: '#/manage/websites/new' }
      : { id: 'ask-admin', label: 'Ask your admin to register your website' };
  return { id: 'nothing-yet', label: 'Nothing to see yet. Ask your admin.' };
}

function dataAction(input: StageInput): NextAction {
  if (input.role === 'analyst')
    return { id: 'waiting-for-data', label: 'Waiting for the first data.' };
  return {
    id: 'install-website',
    label: 'Follow the install steps, then check',
    href: input.firstWebsiteId
      ? `#/manage/websites/${encodeURIComponent(input.firstWebsiteId)}/install`
      : '#/manage/websites'
  };
}

/** The four-stage journey: what is done, what is current, and the one thing to do next. */
export function computeStages(input: StageInput): Stage[] {
  const connected = input.connection === 'connected';
  const done = [true, connected, connected && input.websites > 0, connected && input.dataArriving];
  for (let index = 1; index < done.length; index += 1)
    done[index] = done[index]! && done[index - 1]!;
  const current = done.indexOf(false);
  const blocked = input.connection === 'unreachable' || input.connection === 'incompatible';
  const ids: StageId[] = ['console', 'backend', 'website', 'data'];
  return ids.map((id, index) => {
    if (done[index]) return { id, label: LABELS[id], status: 'done' };
    const status: StageStatus =
      blocked && index >= 1 ? 'blocked' : index === current ? 'current' : 'todo';
    if (index !== current) return { id, label: LABELS[id], status };
    const next =
      index === 1 ? backendAction(input) : index === 2 ? websiteAction(input) : dataAction(input);
    return { id, label: LABELS[id], status, next };
  });
}
