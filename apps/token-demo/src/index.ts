import { createHmac } from 'node:crypto';
import type { TokenClaims } from '@vizoalica/event-contracts';

export interface DemoTokenRequest {
  projectId: string;
  sourceId: string;
  origin: string;
  subject?: string;
  secret?: string;
  now?: Date;
  ttlSeconds?: number;
  maxEvents?: number;
}

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function sign(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('base64url');
}

export function createDemoIngestToken(request: DemoTokenRequest): string {
  const nowSeconds = Math.floor((request.now ?? new Date()).getTime() / 1000);
  const claims: TokenClaims = {
    iss: 'vizoalica-token-demo',
    aud: 'vizoalica-ingest',
    sub: request.subject ?? `source/${request.sourceId}`,
    project_id: request.projectId,
    source_id: request.sourceId,
    origin: request.origin,
    scope: 'events:write',
    iat: nowSeconds,
    nbf: nowSeconds,
    exp: nowSeconds + (request.ttlSeconds ?? 300),
    jti: `demo_${nowSeconds}_${Math.random().toString(36).slice(2)}`,
    max_events: request.maxEvents ?? 25
  };
  const signingInput = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(claims)}`;
  return `${signingInput}.${sign(signingInput, request.secret ?? 'dev-secret')}`;
}
