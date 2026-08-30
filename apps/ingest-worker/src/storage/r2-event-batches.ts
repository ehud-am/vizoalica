import type { StoredEvent } from '../../../ingest-api/src/domain/types.js';
import type { EventRepository } from '../../../ingest-api/src/storage/repositories.js';
import type { R2Bucket } from '../env.js';

function keyFor(event: StoredEvent): string {
  const day = event.receivedAt.toISOString().slice(0, 10);
  return `events/${encodeURIComponent(event.projectId)}/${encodeURIComponent(event.sourceId)}/${day}/${crypto.randomUUID()}.json`;
}

export class R2EventBatchRepository implements EventRepository {
  constructor(private readonly bucket: R2Bucket) {}
  async saveAcceptedEvents(events: StoredEvent[]): Promise<void> {
    if (!events.length) return;
    const first = events[0];
    if (!first) return;
    await this.bucket.put(keyFor(first), JSON.stringify(events), {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: {
        project: first.projectId,
        source: first.sourceId,
        count: String(events.length),
        trust: first.trustLevel,
        consent: first.consentState,
        schema_version: first.event.specversion,
        received_at: first.receivedAt.toISOString()
      }
    });
  }
  async listAcceptedEvents(): Promise<StoredEvent[]> {
    return [];
  }
}
