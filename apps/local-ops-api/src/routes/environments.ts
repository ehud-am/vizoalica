import type { Registry } from '../environments/registry.js';
import { buildSetupState, type SetupDeps } from '../setup/state.js';

export type EnvironmentsReply = { status: number; body: unknown };

/** What the console draws: every environment's state (never a secret) and which one is selected. */
function listing(registry: Registry) {
  const { file, environments, selected } = registry.snapshot;
  return { file, environments, selected: selected ?? null };
}

/**
 * The console can only look at environments and choose one; adding, changing, and removing them is
 * `vizoalica env`, which edits the file. Every read here re-reads that file if it changed.
 */
export async function handleEnvironments(
  method: string,
  pathname: string,
  deps: SetupDeps
): Promise<EnvironmentsReply | undefined> {
  const { registry } = deps;
  if (method === 'GET' && pathname === '/api/environments') {
    await registry.refresh();
    return { status: 200, body: listing(registry) };
  }
  if (method === 'POST' && pathname === '/api/environments/recheck') {
    await registry.refresh(true);
    return { status: 200, body: listing(registry) };
  }
  const select = /^\/api\/environments\/([^/]+)\/select$/.exec(pathname);
  if (method === 'POST' && select) {
    try {
      await registry.select(decodeURIComponent(select[1]!));
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'environment_not_found') return { status: 404, body: { error: code } };
      if (code === 'environment_unusable') return { status: 409, body: { error: code } };
      throw error;
    }
    return { status: 200, body: await buildSetupState(deps) };
  }
  if (method === 'GET' && pathname === '/api/setup/state') {
    await registry.refresh();
    return registry.current()
      ? { status: 200, body: await buildSetupState(deps) }
      : { status: 409, body: { error: 'no_usable_environment', ...listing(registry) } };
  }
  return undefined;
}
