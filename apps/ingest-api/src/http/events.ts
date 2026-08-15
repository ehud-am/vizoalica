import type { PipelineDependencies } from '../ingestion/pipeline.js';
import { ingestBatch } from '../ingestion/pipeline.js';

export async function eventsBatchResponse(
  request: Request,
  dependencies: PipelineDependencies
): Promise<Response> {
  const publicSourceKey = request.headers.get('x-vizoalica-source');
  if (!publicSourceKey) return Response.json({ error: 'missing_source' }, { status: 400 });
  const result = await ingestBatch(
    {
      body: await request.text(),
      publicSourceKey,
      origin: request.headers.get('origin'),
      authorization: request.headers.get('authorization')
    },
    dependencies
  );
  return Response.json(
    {
      decision: result.decision.decision,
      accepted_count: result.decision.acceptedCount,
      rejected_count: result.decision.rejectedCount,
      reason_codes: result.decision.reasonCodes
    },
    { status: result.status }
  );
}
