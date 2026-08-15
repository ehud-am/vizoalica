export function healthResponse(): Response {
  return Response.json({ ok: true, service: 'vizoalica-ingest-api' });
}
