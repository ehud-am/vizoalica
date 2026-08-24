import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { JsonlGzipBatchSink, toRawRecord } from '../../src/storage/jsonl-gzip-batch.js';
import { now, pageViewEvent } from '../test-helpers.js';
import type { StoredEvent } from '../../src/domain/types.js';

function storedEvent(id: string): StoredEvent {
  return {
    projectId: 'proj_1',
    sourceId: 'src_1',
    trustLevel: 'signed-session',
    consentState: 'analytics-granted',
    receivedAt: now,
    event: pageViewEvent(id)
  };
}

describe('JsonlGzipBatchSink', () => {
  it('writes compressed JSONL files partitioned by project/date/hour', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'vizoalica-jsonl-'));
    const sink = new JsonlGzipBatchSink({
      rootDir,
      maxEventsPerFile: 2,
      clock: () => now,
      idFactory: () => 'batch_1'
    });

    await sink.writeAcceptedEvents([storedEvent('evt_jsonl_1'), storedEvent('evt_jsonl_2')]);

    expect(sink.flushResults).toHaveLength(1);
    const result = sink.flushResults[0]!;
    expect(result.objectPath).toContain('project_id=proj_1');
    expect(result.objectPath).toContain(`dt=${now.toISOString().slice(0, 10)}`);
    expect(result.objectPath).toContain(`hour=${now.toISOString().slice(11, 13)}`);
    expect(result.compressedBytes).toBeLessThan(result.uncompressedBytes);

    const lines = gunzipSync(await readFile(result.objectPath))
      .toString('utf8')
      .trim()
      .split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      schema_version: 'v0.1.0',
      project_id: 'proj_1',
      event_type: 'com.vizoalica.page_view.v1'
    });
  });

  it('converts stored events into stable Parquet-ready top-level records', () => {
    expect(toRawRecord(storedEvent('evt_jsonl_3'))).toMatchObject({
      schema_version: 'v0.1.0',
      project_id: 'proj_1',
      source_id: 'src_1',
      event_id: 'evt_jsonl_3',
      event_type: 'com.vizoalica.page_view.v1',
      trust_level: 'signed-session',
      consent_state: 'analytics-granted'
    });
  });
});
