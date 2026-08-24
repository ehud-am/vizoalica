import { mkdtemp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ParquetChunkSink, toParquetRow } from '../../src/storage/parquet-chunk.js';
import { now, pageViewEvent, project, source } from '../test-helpers.js';
import type { StoredEvent } from '../../src/domain/types.js';

const require = createRequire(import.meta.url);
const parquet = require('parquetjs-lite') as {
  ParquetReader: {
    openFile(path: string): Promise<{
      getCursor(): { next(): Promise<Record<string, unknown> | null> };
      close(): Promise<void>;
    }>;
  };
};

describe('ParquetChunkSink', () => {
  it('writes buffered accepted events to Parquet files partitioned by project/date/hour', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'vizoalica-parquet-'));
    const sink = new ParquetChunkSink({
      rootDir,
      maxEventsPerFile: 2,
      clock: () => now,
      idFactory: () => 'chunk_1'
    });

    await sink.writeAcceptedEvents([storedEvent('evt_parquet_1'), storedEvent('evt_parquet_2')]);

    expect(sink.bufferedEventCount).toBe(0);
    expect(sink.counters).toMatchObject({
      acceptedEvents: 2,
      persistedEvents: 2,
      droppedEvents: 0,
      flushFailures: 0
    });
    const [result] = sink.flushResults;
    expect(result).toMatchObject({ eventCount: 2, format: 'parquet' });
    expect(result?.objectPath).toContain('project_id=proj_1/dt=');
    expect(result?.objectPath.endsWith('.parquet')).toBe(true);

    const reader = await parquet.ParquetReader.openFile(result!.objectPath);
    const cursor = reader.getCursor();
    const first = await cursor.next();
    const second = await cursor.next();
    const done = await cursor.next();
    await reader.close();

    expect(first).toMatchObject({
      project_id: 'proj_1',
      source_id: 'src_1',
      event_id: 'evt_parquet_1',
      event_type: 'com.vizoalica.page_view.v1'
    });
    expect(second).toMatchObject({ event_id: 'evt_parquet_2' });
    expect(done).toBeNull();
  });

  it('drops events above the bounded in-memory buffer', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'vizoalica-parquet-lossy-'));
    const sink = new ParquetChunkSink({ rootDir, maxEventsPerFile: 10, maxBufferedEvents: 1 });

    await sink.writeAcceptedEvents([storedEvent('evt_keep'), storedEvent('evt_drop')]);

    expect(sink.bufferedEventCount).toBe(1);
    expect(sink.counters).toMatchObject({ acceptedEvents: 2, droppedEvents: 1 });
  });

  it('converts events into stable top-level Parquet rows', () => {
    expect(toParquetRow(storedEvent('evt_parquet_3'))).toMatchObject({
      schema_version: 'v0.1.0',
      project_id: 'proj_1',
      source_id: 'src_1',
      event_id: 'evt_parquet_3',
      trust_level: 'signed-session',
      consent_state: 'analytics-granted'
    });
  });
});

function storedEvent(id: string): StoredEvent {
  return {
    projectId: project.id,
    sourceId: source.id,
    trustLevel: 'signed-session',
    consentState: 'analytics-granted',
    event: pageViewEvent(id),
    receivedAt: now
  };
}
