import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ingestBatch } from '../../src/ingestion/pipeline.js';
import { JsonlGzipBatchSink } from '../../src/storage/jsonl-gzip-batch.js';
import { createRepositories, now, pageViewEvent, secret, source, token } from '../test-helpers.js';

describe('JSONL gzip sink integration', () => {
  it('persists accepted events through a compressed batch sink', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'vizoalica-pipeline-jsonl-'));
    const sink = new JsonlGzipBatchSink({
      rootDir,
      maxEventsPerFile: 5,
      clock: () => now,
      idFactory: () => 'pipeline_batch'
    });
    const result = await ingestBatch(
      {
        body: JSON.stringify([pageViewEvent('evt_pipeline_jsonl_1')]),
        publicSourceKey: source.publicSourceKey,
        origin: 'https://example.com',
        authorization: `Bearer ${token()}`,
        now
      },
      { repositories: createRepositories(), tokenSecret: secret, acceptedEventSink: sink }
    );

    expect(result.status).toBe(202);
    expect(sink.bufferedEventCount).toBe(1);
    const flushed = await sink.flush();
    expect(flushed?.eventCount).toBe(1);
    const body = gunzipSync(await readFile(flushed!.objectPath)).toString('utf8');
    expect(body).toContain('evt_pipeline_jsonl_1');
    expect(body).toContain('schema_version');
  });
});
