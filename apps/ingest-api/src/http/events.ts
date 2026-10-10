import type { RequestAnalyticsContext } from '../domain/types.js';
import type { PipelineDependencies } from '../ingestion/pipeline.js';
import { ingestBatch } from '../ingestion/pipeline.js';

export async function eventsBatchResponseForBody(
  request: Request,
  body: string,
  dependencies: PipelineDependencies,
  analyticsContext?: RequestAnalyticsContext
): Promise<Response> {
  const publicSourceKey = request.headers.get('x-vizoalica-source');
  if (!publicSourceKey) return Response.json({ error: 'missing_source' }, { status: 400 });
  const result = await ingestBatch(
    {
      body,
      publicSourceKey,
      origin: request.headers.get('origin'),
      authorization: request.headers.get('authorization'),
      ...(analyticsContext ? { analyticsContext } : {})
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
