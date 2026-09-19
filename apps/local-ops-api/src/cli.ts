import { loadConfig, loadConfigFile, writeConfigFile } from './config.js';
import { createLocalServer } from './server.js';
import { Writable } from 'node:stream';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { existsSync } from 'node:fs';

async function readCredential(): Promise<string> {
  let value: string;
  if (stdin.isTTY && stdout.isTTY) {
    let muted = false;
    const hiddenOutput = new Writable({
      write(chunk, _encoding, callback) {
        if (!muted) stdout.write(chunk);
        callback();
      }
    });
    const prompt = createInterface({ input: stdin, output: hiddenOutput, terminal: true });
    try {
      stdout.write('Administrator secret (input hidden): ');
      muted = true;
      value = await prompt.question('');
      muted = false;
      stdout.write('\n');
    } finally {
      prompt.close();
    }
  } else {
    const chunks: Buffer[] = [];
    for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
    value = Buffer.concat(chunks)
      .toString('utf8')
      .replace(/\r?\n$/, '');
  }
  if (!value.trim() || /[\r\n]/.test(value)) throw new Error('credential_is_required');
  if (value === 'onecli-managed') throw new Error('placeholder_is_reserved_for_onecli');
  return value;
}

async function main(): Promise<void> {
  const [command = 'serve', path, remoteUrl, ...rest] = process.argv.slice(2);
  if (command === 'configure') {
    const replace = rest.length === 1 && rest[0] === '--replace';
    if (!path || !remoteUrl || (rest.length > 0 && !replace))
      throw new Error('usage: configure <path> <remote-url> [--replace]');
    if (existsSync(path) && !replace) throw new Error('config_exists_use_replace');
    const credential = await readCredential();
    writeConfigFile(
      path,
      { VIZOALICA_REMOTE_URL: remoteUrl, VIZOALICA_ADMIN_SECRET: credential },
      { replace }
    );
    console.log(`Configuration written with user-only permissions: ${path}`);
  } else if (command === 'revoke') {
    if (!path) throw new Error('usage: revoke <path>');
    writeConfigFile(
      path,
      { VIZOALICA_REMOTE_URL: 'https://revoked.invalid', VIZOALICA_ADMIN_SECRET: '' },
      { replace: true }
    );
    console.log(`Local authorization revoked: ${path}`);
  } else {
    const config = path ? loadConfigFile(path) : loadConfig();
    // This check is a foot-gun guard for an honest operator who ran the
    // wrong startup command, not a security boundary: anyone able to set
    // VIZOALICA_ONECLI_WRAPPED=1 already has local shell access to this
    // machine, and therefore to the config file itself.
    if (config.adminSecret === 'onecli-managed' && process.env.VIZOALICA_ONECLI_WRAPPED !== '1')
      throw new Error(
        'onecli_placeholder_requires_wrapper: start this configuration with pnpm vizoalica console'
      );
    createLocalServer(config).listen(config.port, '127.0.0.1', () =>
      console.log(`Vizoalica local API listening on http://127.0.0.1:${config.port}`)
    );
  }
}

await main();
