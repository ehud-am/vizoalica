export type ViewRole = 'admin' | 'owner' | 'analyst';
export type StageId = 'console' | 'backend' | 'website' | 'data';
export type StageStatus = 'done' | 'current' | 'todo' | 'blocked';
export type ConnectionStatus = 'connected' | 'unreachable' | 'revoked' | 'incompatible';
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

function backendAction(input: StageInput): NextAction {
  if (input.connection === 'unreachable')
    return { id: 'check-backend', label: 'The backend is not answering. Check it and retry.' };
  if (input.connection === 'incompatible')
    return {
      id: 'update-console',
      label:
        'This backend does not work with this console. Update the console: npm update -g vizoalica'
    };
  return {
    id: 'fix-environment',
    label:
      'The backend rejected the saved credential. Fix this environment with: vizoalica env update <name>'
  };
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
