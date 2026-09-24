import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createService, listenLoopback } from '../../local-ops-api/src/service.js';

export const CONSOLE_ADDRESS = (port: number) => `http://127.0.0.1:${port}`;

export type ConsoleDeps = {
  env: NodeJS.ProcessEnv;
  home: string;
  version: string;
  /** Where the packaged console, SDK files, and database changes were unpacked (the dist folder). */
  assetDir: string;
  out: (text: string) => void;
  err: (text: string) => void;
  openBrowser: (url: string) => void;
  /** Resolves when the user asks the console to stop (an interrupt or terminate signal). */
  waitForStop: () => Promise<void>;
  /** Tests replace these; the defaults are the real service. */
  createService?: typeof createService;
  listen?: typeof listenLoopback;
};

function busyMessage(port: number): string {
  return `A console is probably running already. Open ${CONSOLE_ADDRESS(port)}, or stop it (Ctrl+C in its terminal) and run this again.`;
}

export type ConsoleOptions = { open: boolean };

/** `vizoalica console`: start the service and the console as one process. */
export async function consoleCommand(options: ConsoleOptions, deps: ConsoleDeps): Promise<number> {
  const homeDir = join(deps.home, '.config', 'vizoalica');
  const port = Number(deps.env.VIZOALICA_PORT ?? 4318);
  const address = CONSOLE_ADDRESS(port);
  const service = (deps.createService ?? createService)({
    homeDir,
    consoleDir: join(deps.assetDir, 'console'),
    sdkDir: join(deps.assetDir, 'sdk'),
    schemaDir: join(deps.assetDir, 'schema'),
    version: deps.version,
    env: deps.env
  });
  if (!existsSync(join(deps.assetDir, 'console')) && !deps.createService)
    deps.err(
      'Note: the console files were not found next to this command, so pages will not load.\n'
    );
  try {
    await (deps.listen ?? listenLoopback)(service.server, port);
  } catch (error) {
    if (error instanceof Error && error.message === 'port_in_use') {
      deps.err(`${busyMessage(port)}\n`);
      return 1;
    }
    throw error;
  }
  deps.out(`Vizoalica console: ${address}\nKeep this terminal open; press Ctrl+C once to stop.\n`);
  // The console itself explains what is wrong; the terminal only points at where to look.
  await service.registry.refresh();
  const { environments, selected } = service.registry.snapshot;
  if (!selected)
    deps.out(
      `No environment is usable yet, so the console will only show what to fix.\nCheck them with: vizoalica env list\n`
    );
  else
    deps.out(
      `Environment: ${selected} (${environments.filter((item) => item.usable).length} of ${environments.length} usable)\n`
    );
  if (options.open) deps.openBrowser(address);
  await deps.waitForStop();
  await new Promise<void>((resolve) => {
    service.server.close(() => resolve());
    // A browser keeping a connection alive must not hold the command open.
    service.server.closeAllConnections();
  });
  return 0;
}
