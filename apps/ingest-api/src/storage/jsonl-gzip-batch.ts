import { gzipSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { StoredEvent } from '../domain/types.js';
import type { AcceptedEventSink, BatchFlushResult } from './accepted-event-sink.js';

export interface JsonlGzipBatchSinkOptions {
  rootDir: string;
  maxEventsPerFile?: number;
  clock?: () => Date;
  idFactory?: () => string;
}

export class JsonlGzipBatchSink implements AcceptedEventSink {
  private readonly maxEventsPerFile: number;
  private readonly clock: () => Date;
  private readonly idFactory: () => string;
  private readonly buffer: StoredEvent[] = [];
  readonly flushResults: BatchFlushResult[] = [];

  constructor(private readonly options: JsonlGzipBatchSinkOptions) {
    this.maxEventsPerFile = options.maxEventsPerFile ?? 10_000;
    this.clock = options.clock ?? (() => new Date());
    this.idFactory =
      options.idFactory ??
      (() =>
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }

  async writeAcceptedEvents(events: StoredEvent[]): Promise<void> {
    this.buffer.push(...events);
    while (this.buffer.length >= this.maxEventsPerFile) {
      await this.flushChunk(this.buffer.splice(0, this.maxEventsPerFile));
    }
  }

  async flush(): Promise<BatchFlushResult | undefined> {
    if (this.buffer.length === 0) return undefined;
    return this.flushChunk(this.buffer.splice(0, this.buffer.length));
  }

  get bufferedEventCount(): number {
    return this.buffer.length;
  }

  private async flushChunk(events: StoredEvent[]): Promise<BatchFlushResult> {
    const first = events[0];
    if (!first) throw new Error('cannot flush empty event batch');
    const dt = first.receivedAt.toISOString().slice(0, 10);
    const hour = first.receivedAt.toISOString().slice(11, 13);
    const dir = join(
      this.options.rootDir,
      `project_id=${first.projectId}`,
      `dt=${dt}`,
      `hour=${hour}`
    );
    await mkdir(dir, { recursive: true });

    const jsonl = events.map((event) => JSON.stringify(toRawRecord(event))).join('\n') + '\n';
    const compressed = gzipSync(jsonl);
    const file = join(
      dir,
      `${first.sourceId}-${this.clock().toISOString().replace(/[:.]/g, '-')}-${this.idFactory()}.jsonl.gz`
    );
    await writeFile(file, compressed);
    const result = {
      objectPath: file,
      eventCount: events.length,
      uncompressedBytes: Buffer.byteLength(jsonl),
      compressedBytes: compressed.byteLength,
      format: 'jsonl.gz' as const
    };
    this.flushResults.push(result);
    return result;
  }
}

export function toRawRecord(stored: StoredEvent): Record<string, unknown> {
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
    subject: stored.event.subject,
    source: stored.event.source,
    traceparent: stored.event.traceparent,
    tracestate: stored.event.tracestate,
    data: stored.event.data
  };
}
