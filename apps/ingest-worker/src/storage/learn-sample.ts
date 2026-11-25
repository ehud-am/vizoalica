import type { CloudEvent } from '@vizoalica/event-contracts';
import type { StoredEvent } from '../../../ingest-api/src/domain/types.js';
import { sketchEvents, type Sketch } from '../../../ingest-api/src/spec/learn-sketch.js';
import type { R2Bucket } from '../env.js';
import { eventObjectPrefix } from './r2-event-batches.js';

/** Raw batches are kept 7 days (lifecycle rule), so a sample never reaches further back. */
export const SAMPLE_DAYS = 7;
/** One call reads this many batches (each up to 25 events): about 1,000 events. */
export const SAMPLE_OBJECTS_PER_CALL = 40;
const DAY_MS = 86_400_000;

export type SampleSlice = { sketch: Sketch; objects: number; cursor?: string; done: boolean };

type Position = { day: number; list?: string };

const encode = (position: Position): string => btoa(JSON.stringify(position));
function decode(cursor: string | undefined): Position | undefined {
  if (!cursor) return { day: 0 };
  try {
    const value = JSON.parse(atob(cursor)) as Partial<Position>;
    if (!Number.isInteger(value.day) || value.day! < 0 || value.day! > SAMPLE_DAYS)
      return undefined;
    return { day: value.day!, ...(typeof value.list === 'string' ? { list: value.list } : {}) };
  } catch {
    return undefined;
  }
}

/**
 * Summarises the newest raw batches of one website, a slice at a time. The caller passes the
 * returned cursor to continue. Days run newest first; within a day, batches are in storage order.
 * The slice holds counts only: no event ids, visitor tokens or session ids. Page loads of one
 * visitor and day link up only when they fall in the same call (about 1,000 events).
 */
export async function sampleEvents(
  bucket: Pick<R2Bucket, 'list'> & {
    get(key: string): Promise<{ text(): Promise<string> } | null>;
  },
  projectId: string,
  sourceId: string,
  cursor: string | undefined,
  now: Date,
  maxObjects = SAMPLE_OBJECTS_PER_CALL
): Promise<SampleSlice | undefined> {
  const position = decode(cursor);
  if (!position) return undefined;
  const events: CloudEvent[] = [];
  const visitorDays = new Map<CloudEvent, string>();
  let objects = 0;
  while (position.day <= SAMPLE_DAYS && objects < maxObjects) {
    const day = new Date(now.getTime() - position.day * DAY_MS).toISOString().slice(0, 10);
    const listed = await bucket.list({
      prefix: `${eventObjectPrefix(projectId, sourceId)}${day}/`,
      limit: maxObjects - objects,
      ...(position.list ? { cursor: position.list } : {})
    });
    for (const object of listed.objects) {
      const body = await bucket.get(object.key);
      if (!body) continue;
      objects += 1;
      let stored: StoredEvent[] = [];
      try {
        stored = JSON.parse(await body.text()) as StoredEvent[];
      } catch {
        continue;
      }
      for (const item of stored) {
        const event = item.event as CloudEvent;
        events.push(event);
        if (typeof item.visitorDay === 'string' && item.visitorDay)
          visitorDays.set(event, item.visitorDay);
      }
    }
    if (listed.truncated && listed.cursor) position.list = listed.cursor;
    else {
      position.day += 1;
      delete position.list;
    }
  }
  const done = position.day > SAMPLE_DAYS;
  return {
    // One sketch for the whole call, so a visitor's page loads in these batches link up.
    sketch: sketchEvents(events, visitorDays),
    objects,
    done,
    ...(done ? {} : { cursor: encode(position) })
  };
}
