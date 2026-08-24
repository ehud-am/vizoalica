import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingestBatch } from '../../../ingest-api/src/ingestion/pipeline.js';
import { ParquetChunkSink } from '../../../ingest-api/src/storage/parquet-chunk.js';
import {
  createRepositories,
  now,
  pageViewEvent,
  secret,
  token
} from '../../../ingest-api/tests/test-helpers.js';
import { analyzeEvents } from '../../src/duckdb-analysis.js';

describe('end-to-end MVP analytics', () => {
  it('accepts browser JSON batches, flushes Parquet, and summarizes with DuckDB', async () => {
    const storageRoot = await mkdtemp(join(tmpdir(), 'vizoalica-e2e-'));
    const sink = new ParquetChunkSink({
      rootDir: storageRoot,
      maxEventsPerFile: 10,
      clock: () => now,
      idFactory: () => 'mvp'
    });
    const repositories = createRepositories();

    const pricingView = pageViewEvent('evt_pricing_1');
    const docsView = pageViewEvent('evt_docs_1');
    docsView.data.page.url_path = '/docs';

    const result = await ingestBatch(
      {
        body: JSON.stringify([pricingView, docsView]),
        publicSourceKey: 'public_src_1',
        origin: 'https://example.com',
        authorization: `Bearer ${token({ max_events: 2 })}`,
        now
      },
      { repositories, tokenSecret: secret, acceptedEventSink: sink }
    );
    expect(result.status).toBe(202);

    await sink.flush();
    expect(sink.counters).toMatchObject({ acceptedEvents: 2, persistedEvents: 2 });

    const summary = await analyzeEvents({ storageRoot, projectId: 'proj_1', date: datePart(now) });

    expect(summary.overview).toMatchObject({
      total_events: 2,
      page_views: 2,
      custom_events: 0,
      visitors: 1,
      sessions: 1
    });
    expect(summary.events_by_type).toEqual([
      { event_type: 'com.vizoalica.page_view.v1', events: 2 }
    ]);
    expect(summary.page_views_by_path).toEqual([
      { page_path: '/docs', views: 1, visitors: 1, sessions: 1 },
      { page_path: '/pricing', views: 1, visitors: 1, sessions: 1 }
    ]);
  });
});

function datePart(date: Date): string {
  return date.toISOString().slice(0, 10);
}
