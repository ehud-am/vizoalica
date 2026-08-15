import type { IngestionDecision } from '../domain/types.js';
import type { MetricsSink } from './index.js';

export function recordIngestionDecision(metrics: MetricsSink, decision: IngestionDecision): void {
  metrics.increment('vizoalica_ingestion_requests_total', {
    decision: decision.decision,
    project_id: decision.projectId
  });
  metrics.increment(
    'vizoalica_ingestion_events_accepted_total',
    { project_id: decision.projectId },
    decision.acceptedCount
  );
  metrics.increment(
    'vizoalica_ingestion_events_rejected_total',
    { project_id: decision.projectId },
    decision.rejectedCount
  );
  for (const reason of decision.reasonCodes) {
    metrics.increment('vizoalica_ingestion_rejections_total', {
      reason,
      project_id: decision.projectId
    });
  }
}
