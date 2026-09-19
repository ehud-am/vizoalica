import { describe, expect, it, vi } from 'vitest';
import { createDenialAuditGate } from '../src/http/denial-audit.js';
import { handleAdminRequest } from '../src/http/admin-adapter.js';
import { handleMcpRequest } from '../src/http/mcp-adapter.js';

const SECRET = 'admin-secret-0123456789abcdefghijklmn';

function repository() {
  return {
    saveAdminAudit: vi.fn(async () => undefined),
    listProjects: vi.fn(async () => [])
  };
}

describe('denial audit gate', () => {
  it('lets one denial through per interval, then again once the interval has passed', () => {
    let now = 1_000;
    const gate = createDenialAuditGate(60_000, () => now);
    expect(gate()).toBe(true);
    for (const offset of [0, 1, 30_000, 59_999]) {
      now = 1_000 + offset;
      expect(gate(), `after ${offset} ms`).toBe(false);
    }
    now = 1_000 + 60_000;
    expect(gate()).toBe(true);
    expect(gate()).toBe(false);
  });
});

describe('unauthenticated requests cannot make the Worker write to D1 as often as they like', () => {
  it('audits one denied admin request per interval and refuses every one of them', async () => {
    const repositories = repository();
    const gate = createDenialAuditGate(60_000, () => 0);
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const response = await handleAdminRequest(
        new Request(`https://worker.test/v1/admin/projects?attempt=${attempt}`, {
          headers: { authorization: 'Bearer guess' }
        }),
        { repositories: repositories as never, adminSecret: SECRET, auditDenial: gate }
      );
      statuses.push(response!.status);
    }
    expect(new Set(statuses)).toEqual(new Set([401]));
    expect(repositories.saveAdminAudit).toHaveBeenCalledTimes(1);
    expect(repositories.saveAdminAudit).toHaveBeenCalledWith({
      operation: 'admin',
      outcome: 'denied',
      reasonCode: 'unauthorized'
    });
  });

  it('does the same for MCP, whatever the method', async () => {
    const repositories = repository();
    const gate = createDenialAuditGate(60_000, () => 0);
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const response = await handleMcpRequest(
        new Request('https://worker.test/mcp', {
          method: attempt % 2 ? 'GET' : 'POST',
          headers: { authorization: attempt % 3 ? 'Bearer guess' : '' }
        }),
        { repositories: repositories as never, adminSecret: SECRET, auditDenial: gate }
      );
      expect(response!.status).toBe(401);
    }
    expect(repositories.saveAdminAudit).toHaveBeenCalledTimes(1);
  });

  it('shares one budget by default, so admin and MCP together stay within one write per interval', async () => {
    const repositories = repository();
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await handleAdminRequest(new Request('https://worker.test/v1/admin/projects'), {
        repositories: repositories as never,
        adminSecret: SECRET
      });
      await handleMcpRequest(new Request('https://worker.test/mcp', { method: 'POST' }), {
        repositories: repositories as never,
        adminSecret: SECRET
      });
    }
    expect(repositories.saveAdminAudit.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('never throttles the audit of authenticated operations', async () => {
    const repositories = repository();
    const denyEverything = () => false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await handleAdminRequest(
        new Request('https://worker.test/v1/admin/projects', {
          headers: { authorization: `Bearer ${SECRET}` }
        }),
        { repositories: repositories as never, adminSecret: SECRET, auditDenial: denyEverything }
      );
      expect(response!.status).toBe(200);
    }
    const created = await handleAdminRequest(
      new Request('https://worker.test/v1/admin/projects', {
        method: 'POST',
        headers: { authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Audited' })
      }),
      {
        repositories: {
          ...repositories,
          createQuotaPolicy: vi.fn(),
          createProject: vi.fn()
        } as never,
        adminSecret: SECRET,
        auditDenial: denyEverything
      }
    );
    expect(created!.status).toBe(201);
  });
});
