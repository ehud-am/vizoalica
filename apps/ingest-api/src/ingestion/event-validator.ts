import { compileBatchValidator, type CloudEvent } from '@vizoalica/event-contracts';
import { isEventTimeAcceptable } from '../auth/token-constraints.js';

export type EventValidationResult =
  | { ok: true; events: CloudEvent[] }
  | {
      ok: false;
      reason: 'invalid_json' | 'invalid_schema' | 'invalid_event_time';
      details?: string[];
    };

const validateBatch = compileBatchValidator();

export function validateEventBatch(body: string, now = new Date()): EventValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
  if (!validateBatch(parsed)) {
    const details = validateBatch.errors?.map((error) => `${error.instancePath} ${error.message}`);
    return details
      ? { ok: false, reason: 'invalid_schema', details }
      : { ok: false, reason: 'invalid_schema' };
  }
  const events = parsed as CloudEvent[];
  if (events.some((event) => !isEventTimeAcceptable(event.time, now)))
    return { ok: false, reason: 'invalid_event_time' };
  return { ok: true, events };
}
