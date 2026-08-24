import { mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { StoredEvent } from '../domain/types.js';
import type {
  AcceptedEventSink,
  AcceptedEventSinkCounters,
  BatchFlushResult
} from './accepted-event-sink.js';

const require = createRequire(import.meta.url);
const parquet = require('parquetjs-lite') as ParquetModule;

interface ParquetModule {
  ParquetSchema: new (schema: Record<string, ParquetFieldDefinition>) => ParquetSchema;
  ParquetWriter: {
    openFile(
      schema: ParquetSchema,
      path: string,
      options?: { rowGroupSize?: number }
    ): Promise<ParquetWriter>;
  };
}

interface ParquetSchema {}

interface ParquetWriter {
  appendRow(row: Record<string, unknown>): Promise<void>;
  close(): Promise<void>;
}

type ParquetFieldDefinition = {
  type: 'UTF8' | 'INT64';
  optional?: boolean;
  compression?: 'GZIP' | 'SNAPPY' | 'UNCOMPRESSED';
};

export interface ParquetChunkSinkOptions {
  rootDir: string;
  maxEventsPerFile?: number;
  maxBufferedEvents?: number;
  rowGroupSize?: number;
  clock?: () => Date;
  idFactory?: () => string;
}

interface PartitionBuffer {
  projectId: string;
  sourceId: string;
  dt: string;
  hour: string;
  events: StoredEvent[];
}

const rawParquetSchema = new parquet.ParquetSchema({
  schema_version: { type: 'UTF8', compression: 'GZIP' },
  project_id: { type: 'UTF8', compression: 'GZIP' },
  source_id: { type: 'UTF8', compression: 'GZIP' },
  event_id: { type: 'UTF8', compression: 'GZIP' },
  event_type: { type: 'UTF8', compression: 'GZIP' },
  event_time: { type: 'UTF8', compression: 'GZIP' },
  received_at: { type: 'UTF8', compression: 'GZIP' },
  trust_level: { type: 'UTF8', compression: 'GZIP' },
  consent_state: { type: 'UTF8', compression: 'GZIP' },
  subject: { type: 'UTF8', optional: true, compression: 'GZIP' },
  source: { type: 'UTF8', compression: 'GZIP' },
  traceparent: { type: 'UTF8', optional: true, compression: 'GZIP' },
  tracestate: { type: 'UTF8', optional: true, compression: 'GZIP' },
  data_json: { type: 'UTF8', compression: 'GZIP' }
});

export class ParquetChunkSink implements AcceptedEventSink {
  private readonly maxEventsPerFile: number;
  private readonly maxBufferedEvents: number;
  private readonly rowGroupSize: number;
  private readonly clock: () => Date;
  private readonly idFactory: () => string;
  private readonly buffers = new Map<string, PartitionBuffer>();
  readonly flushResults: BatchFlushResult[] = [];
  readonly counters: AcceptedEventSinkCounters = {
    acceptedEvents: 0,
    bufferedEvents: 0,
    persistedEvents: 0,
    droppedEvents: 0,
    flushFailures: 0
  };

  constructor(private readonly options: ParquetChunkSinkOptions) {
    this.maxEventsPerFile = options.maxEventsPerFile ?? 25_000;
    this.maxBufferedEvents = options.maxBufferedEvents ?? this.maxEventsPerFile * 4;
    this.rowGroupSize = options.rowGroupSize ?? Math.min(this.maxEventsPerFile, 10_000);
    this.clock = options.clock ?? (() => new Date());
    this.idFactory =
      options.idFactory ??
      (() =>
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }

  async writeAcceptedEvents(events: StoredEvent[]): Promise<void> {
    this.counters.acceptedEvents += events.length;
    const flushes: Promise<BatchFlushResult>[] = [];

    for (const event of events) {
      if (this.counters.bufferedEvents >= this.maxBufferedEvents) {
        this.counters.droppedEvents += 1;
        continue;
      }

      const key = partitionKey(event);
      const partition = this.buffers.get(key) ?? createPartitionBuffer(event);
      if (!this.buffers.has(key)) this.buffers.set(key, partition);
      partition.events.push(event);
      this.counters.bufferedEvents += 1;

      while (partition.events.length >= this.maxEventsPerFile) {
        const chunk = partition.events.splice(0, this.maxEventsPerFile);
        this.counters.bufferedEvents -= chunk.length;
        flushes.push(this.flushChunk(partition, chunk));
      }
    }

    await Promise.all(flushes);
  }

  async flush(): Promise<BatchFlushResult[] | undefined> {
    const flushes: Promise<BatchFlushResult>[] = [];
    for (const partition of this.buffers.values()) {
      if (partition.events.length === 0) continue;
      const chunk = partition.events.splice(0, partition.events.length);
      this.counters.bufferedEvents -= chunk.length;
      flushes.push(this.flushChunk(partition, chunk));
    }
    const results = await Promise.all(flushes);
    return results.length > 0 ? results : undefined;
  }

  get bufferedEventCount(): number {
    return this.counters.bufferedEvents;
  }

  private async flushChunk(
    partition: Omit<PartitionBuffer, 'events'>,
    events: StoredEvent[]
  ): Promise<BatchFlushResult> {
    const first = events[0];
    if (!first) throw new Error('cannot flush empty event batch');
    const dir = join(
      this.options.rootDir,
      `project_id=${partition.projectId}`,
      `dt=${partition.dt}`,
      `hour=${partition.hour}`
    );
    await mkdir(dir, { recursive: true });
    const file = join(
      dir,
      `${partition.sourceId}-${this.clock().toISOString().replace(/[:.]/g, '-')}-${this.idFactory()}.parquet`
    );

    try {
      const writer = await parquet.ParquetWriter.openFile(rawParquetSchema, file, {
        rowGroupSize: this.rowGroupSize
      });
      for (const event of events) await writer.appendRow(toParquetRow(event));
      await writer.close();
      const fileStat = await stat(file);
      const uncompressedBytes = events.reduce(
        (sum, event) => sum + Buffer.byteLength(JSON.stringify(toParquetRow(event))),
        0
      );
      const result = {
        objectPath: file,
        eventCount: events.length,
        uncompressedBytes,
        compressedBytes: fileStat.size,
        format: 'parquet' as const
      };
      this.flushResults.push(result);
      this.counters.persistedEvents += events.length;
      return result;
    } catch (error) {
      this.counters.flushFailures += 1;
      this.counters.droppedEvents += events.length;
      throw error;
    }
  }
}

export function toParquetRow(stored: StoredEvent): Record<string, string> {
  return {
    schema_version: 'v0.1.0',
    project_id: stored.projectId,
    source_id: stored.sourceId,
    event_id: stored.event.id,
    event_type: stored.event.type,
    event_time: stored.event.time,
    received_at: stored.receivedAt.toISOString(),
    trust_level: stored.trustLevel,
    consent_state: stored.consentState,
    subject: stored.event.subject ?? '',
    source: stored.event.source,
    traceparent: stored.event.traceparent ?? '',
    tracestate: stored.event.tracestate ?? '',
    data_json: JSON.stringify(stored.event.data)
  };
}

function partitionKey(event: StoredEvent): string {
  const partition = createPartitionBuffer(event);
  return `${partition.projectId}/${partition.dt}/${partition.hour}/${partition.sourceId}`;
}

function createPartitionBuffer(event: StoredEvent): PartitionBuffer {
  const receivedAt = event.receivedAt.toISOString();
  return {
    projectId: event.projectId,
    sourceId: event.sourceId,
    dt: receivedAt.slice(0, 10),
    hour: receivedAt.slice(11, 13),
    events: []
  };
}
