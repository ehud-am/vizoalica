import type { StoredEvent } from '../domain/types.js';

export interface AcceptedEventSink {
  writeAcceptedEvents(events: StoredEvent[]): Promise<void>;
  flush(): Promise<BatchFlushResult[] | BatchFlushResult | undefined>;
}

export interface BatchFlushResult {
  objectPath: string;
  eventCount: number;
  uncompressedBytes: number;
  compressedBytes: number;
  format: 'jsonl.gz' | 'parquet';
}

export interface AcceptedEventSinkCounters {
  acceptedEvents: number;
  bufferedEvents: number;
  persistedEvents: number;
  droppedEvents: number;
  flushFailures: number;
}
