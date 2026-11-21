import { mkdtempSync } from 'node:fs';
import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createService } from '../src/service.js';

const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    server.close();
  }
});

async function start() {
  const service = createService({
    homeDir: mkdtempSync(join(tmpdir(), 'vizoalica-live-')),
    consoleDir: tmpdir(),
    sdkDir: tmpdir()
  });
  await new Promise<void>((resolve) => service.server.listen(0, '127.0.0.1', resolve));
  servers.push(service.server);
  return { service, port: (service.server.address() as AddressInfo).port };
}

describe('console live channel', () => {
  it('tells listening tabs to reload and reports how many there were', async () => {
    const { service, port } = await start();
    expect(service.reloadTabs()).toBe(0);
    let text = '';
    const waitFor = (needle: string) =>
      new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          if (text.includes(needle)) {
            clearInterval(timer);
            resolve();
          }
        }, 5);
      });
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path: '/api/console/live',
        headers: { origin: 'http://127.0.0.1:4318', accept: 'text/event-stream' }
      },
      (response) => {
        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toContain('text/event-stream');
        response.on('data', (chunk: Buffer) => (text += String(chunk)));
      }
    );
    req.end();
    await waitFor(': connected');
    expect(service.reloadTabs()).toBe(1);
    await waitFor('event: reload');
    req.destroy();
  });
});
