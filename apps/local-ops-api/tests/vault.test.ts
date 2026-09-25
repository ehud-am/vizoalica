import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { onecliArguments, Vault } from '../src/environments/vault.js';

const ref = { workspace: 'acme', agent: 'vizoalica', gateway: 'localhost:10255' };

/** A stand-in for `onecli run ... node helper`: answers each request line the way the helper would. */
function fakeOnecli(
  answer: (request: Record<string, unknown>) => Record<string, unknown> | undefined
) {
  const children: Array<
    EventEmitter & { stdin: PassThrough; stdout: PassThrough; kill: () => void }
  > = [];
  const spawn = vi.fn(() => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      kill: vi.fn()
    });
    let buffer = '';
    child.stdin.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      for (let index = buffer.indexOf('\n'); index >= 0; index = buffer.indexOf('\n')) {
        const request = JSON.parse(buffer.slice(0, index)) as Record<string, unknown>;
        buffer = buffer.slice(index + 1);
        const reply = answer(request);
        if (reply) child.stdout.write(`${JSON.stringify({ id: request.id, ...reply })}\n`);
      }
    });
    children.push(child);
    return child;
  });
  return { spawn: spawn as never, children, calls: spawn };
}

describe('onecliArguments', () => {
  it('maps the workspace to the flag installed OneCLI versions still call --project', () => {
    const args = onecliArguments(ref);
    expect(args.slice(0, 7)).toEqual([
      'run',
      '--project',
      'acme',
      '--agent',
      'vizoalica',
      '--gateway',
      'localhost:10255'
    ]);
    expect(args).toContain('--');
  });
});

describe('Vault', () => {
  it('makes a request through one helper and returns a real Response', async () => {
    const fake = fakeOnecli((request) => ({
      status: 200,
      headers: [['content-type', 'application/json']],
      body: Buffer.from(
        JSON.stringify({
          seen: request.url,
          auth: (request.headers as Record<string, string>).authorization
        })
      ).toString('base64')
    }));
    const vault = new Vault(fake.spawn);
    const fetchThrough = vault.fetchFor(ref);
    const response = await fetchThrough(new URL('https://w.test/v1/admin/whoami'), {
      headers: { authorization: 'Bearer onecli-managed' }
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      seen: 'https://w.test/v1/admin/whoami',
      auth: 'Bearer onecli-managed'
    });
    await fetchThrough('https://w.test/again');
    expect(fake.calls).toHaveBeenCalledTimes(1);
    const [command, args] = fake.calls.mock.calls[0] as unknown as [string, string[]];
    expect(command).toBe('onecli');
    expect(args).toEqual(expect.arrayContaining(['--project', 'acme']));
    vault.close();
    expect(fake.children[0]!.kill).toHaveBeenCalled();
  });

  it('shares a helper per workspace, agent, and gateway', async () => {
    const fake = fakeOnecli(() => ({ status: 204, headers: [] }));
    const vault = new Vault(fake.spawn);
    await vault.fetchFor(ref)('https://w.test/a');
    await vault.fetchFor(ref)('https://w.test/b');
    await vault.fetchFor({ ...ref, workspace: 'other' })('https://w.test/c');
    expect(fake.calls).toHaveBeenCalledTimes(2);
  });

  it('says plainly when OneCLI is not installed', async () => {
    const spawn = vi.fn(() => {
      const child = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        kill: vi.fn()
      });
      queueMicrotask(() =>
        child.emit('error', Object.assign(new Error('nope'), { code: 'ENOENT' }))
      );
      return child;
    });
    await expect(new Vault(spawn as never).fetchFor(ref)('https://w.test')).rejects.toMatchObject({
      code: 'onecli_not_installed'
    });
  });

  it('reports a helper that stops, and starts a fresh one for the next request', async () => {
    const fake = fakeOnecli((request) =>
      request.url === 'https://w.test/ok' ? { status: 200, headers: [], body: '' } : undefined
    );
    const vault = new Vault(fake.spawn);
    const fetchThrough = vault.fetchFor(ref);
    const pending = fetchThrough('https://w.test/die');
    await Promise.resolve();
    fake.children[0]!.emit('exit', 1);
    await expect(pending).rejects.toMatchObject({ code: 'onecli_failed' });
    expect((await fetchThrough('https://w.test/ok')).status).toBe(200);
    expect(fake.calls).toHaveBeenCalledTimes(2);
  });

  it('gives up on a helper that never answers', async () => {
    const fake = fakeOnecli(() => undefined);
    const vault = new Vault(fake.spawn, 20);
    await expect(vault.fetchFor(ref)('https://w.test')).rejects.toMatchObject({
      code: 'onecli_timeout'
    });
  });

  it('turns a failed request inside the helper into an unreachable error', async () => {
    const fake = fakeOnecli(() => ({ error: 'request_failed' }));
    await expect(new Vault(fake.spawn).fetchFor(ref)('https://w.test')).rejects.toThrow(
      'remote_unavailable'
    );
  });
});
