export interface DemoTokenRequest {
  projectId: string;
  sourceId: string;
  origin: string;
  subject?: string;
}

export function createUnsignedDemoToken(request: DemoTokenRequest): string {
  const payload = {
    aud: 'vizoalica-ingest',
    scope: 'events:write',
    project_id: request.projectId,
    source_id: request.sourceId,
    origin: request.origin,
    sub: request.subject ?? `source/${request.sourceId}`,
    demo: true
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}
