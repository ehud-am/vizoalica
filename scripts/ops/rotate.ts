import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { presentSecrets } from './backend.js';
import { connectConsole } from './connect.js';
import { type Ctx, OpsError, checkAdminAccess, done, step } from './context.js';
import { SECRETS, SECRET_KINDS, type SecretKind, generateSecrets } from './secrets.js';

const IMPACT: Record<SecretKind, string[]> = {
  admin: [
    'Every operator console stops working until it is given the new secret.',
    'This computer is updated for you; other computers run "pnpm ops connect".',
    'A OneCLI-managed console needs its credential card updated in OneCLI.'
  ],
  token: [
    "Every website's token endpoint must be given the new secret, or visitors' events are rejected (401) until it is.",
    'Cloudflare Pages: pnpm exec wrangler pages secret put VIZOALICA_TOKEN_SECRET --project-name YOUR_PROJECT',
    'GitHub Actions: update the VIZOALICA_TOKEN_SECRET repository secret, then re-run the deploy.'
  ],
  digest: [
    'Unique-visitor counts restart: visitors seen before the change count as new once more.',
    'No events or history are lost, and nothing else needs updating.'
  ]
};

export type RotateOptions = { kind: SecretKind | 'all'; localConfigPath: string };

/** Replaces one secret (or all three) on the Worker, shows the new value once, and updates what it can. */
export async function rotateSecrets(ctx: Ctx, options: RotateOptions): Promise<void> {
  const configPath = join(ctx.cwd, 'deploy', 'cloudflare', 'wrangler.production.toml');
  if (!existsSync(configPath))
    throw new OpsError(
      'This checkout has no deploy/cloudflare/wrangler.production.toml, so it does not know which Worker to change.\nRun "pnpm ops backend" here first; it rebuilds that file from your existing install.'
    );
  const kinds = options.kind === 'all' ? SECRET_KINDS : [options.kind];

  ctx.out(`\nRotating ${kinds.map((kind) => SECRETS[kind].name).join(', ')}. What this changes:\n`);
  for (const kind of kinds) {
    ctx.out(`${SECRETS[kind].name}`);
    IMPACT[kind].forEach((line) => ctx.out(`  • ${line}`));
  }
  ctx.out('');
  if (!(await ctx.prompt.confirm('Rotate now?', false)))
    throw new OpsError('Cancelled. Nothing was changed.');

  const generated = generateSecrets(kinds);
  step(ctx, 'Storing the new value on the Worker…');
  const stored = await ctx.run(['secret', 'bulk', '--config', configPath], {
    stdin: JSON.stringify(generated),
    env: {}
  });
  if (stored.code !== 0)
    throw new OpsError(
      `Storing the new secret failed, so nothing was rotated:\n${stored.stderr.trim().split('\n').slice(-4).join('\n')}`
    );
  done(ctx, 'The Worker now uses the new value.');
  await presentSecrets(ctx, generated);

  if (kinds.includes('admin')) {
    const newSecret = generated[SECRETS.admin.name]!;
    const local = existsSync(options.localConfigPath)
      ? (JSON.parse(readFileSync(options.localConfigPath, 'utf8')) as Record<string, string>)
      : undefined;
    if (!local?.VIZOALICA_REMOTE_URL) {
      ctx.out(
        'This computer has no console configured. On each operator computer run "pnpm ops connect".'
      );
    } else if (local.VIZOALICA_ADMIN_SECRET === 'onecli-managed') {
      ctx.out(
        'This computer uses OneCLI: update the Vizoalica administrator card in OneCLI with the new value.'
      );
    } else {
      step(ctx, 'Updating this computer…');
      for (let attempt = 0; attempt < 6; attempt += 1) {
        if ((await checkAdminAccess(ctx, local.VIZOALICA_REMOTE_URL, newSecret)) === 'ok') break;
        await ctx.sleep(2000); // a new secret can take a few seconds to reach every edge location
      }
      await connectConsole(ctx, {
        configPath: options.localConfigPath,
        workerUrl: local.VIZOALICA_REMOTE_URL,
        adminSecret: newSecret
      });
    }
  }
  if (kinds.includes('token'))
    ctx.out('\nNow update every website (see above). Until you do, its events are rejected.');
}
