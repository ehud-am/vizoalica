import { existsSync } from 'node:fs';
import { type BackendOptions, setUpBackend } from './backend.js';
import { connectConsole } from './connect.js';
import { type Ctx, done } from './context.js';
import { addDemoData } from './demo.js';
import { SECRETS } from './secrets.js';

export type InstallOptions = BackendOptions & { localConfigPath: string };
export type InstallResult = { workerUrl: string; connected: boolean; demo: boolean };

/** Backend → console on this computer → sample data: everything up to the first "aha". */
export async function install(ctx: Ctx, options: InstallOptions): Promise<InstallResult> {
  ctx.out(
    'Vizoalica setup: ① Cloudflare backend → ② operator console on this computer → ③ sample data.\n'
  );
  const backend = await setUpBackend(ctx, options);

  const wantConsole =
    existsSync(options.localConfigPath) ||
    (await ctx.prompt.confirm('\nSet up this computer as an operator console now?', true));
  const connection = wantConsole
    ? await connectConsole(ctx, {
        configPath: options.localConfigPath,
        workerUrl: backend.workerUrl,
        ...(backend.secrets[SECRETS.admin.name]
          ? { adminSecret: backend.secrets[SECRETS.admin.name]! }
          : {})
      })
    : undefined;

  // Sample data needs both secrets, so it is only offered when this very run generated the token one.
  const tokenSecret = backend.secrets[SECRETS.token.name];
  let demo = false;
  if (
    connection?.adminSecret &&
    tokenSecret &&
    (await ctx.prompt.confirm(
      '\nAdd sample data so you can see the console working right away? (removable any time)',
      true
    ))
  ) {
    await addDemoData(ctx, {
      workerUrl: backend.workerUrl,
      adminSecret: connection.adminSecret,
      tokenSecret
    });
    demo = true;
  }
  ctx.out(`\nWorker: ${backend.workerUrl}`);
  ctx.out(
    connection
      ? `This computer: connected (${demo ? 'with sample data; remove it with "pnpm vizoalica demo --remove"' : 'no sample data'})`
      : 'This computer: not connected yet (run "pnpm vizoalica connect")'
  );
  done(ctx, 'Setup complete.');
  return { workerUrl: backend.workerUrl, connected: connection !== undefined, demo };
}
