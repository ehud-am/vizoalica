import { describe, expect, it } from 'vitest';
import { validateEventBatch } from '../../src/ingestion/event-validator.js';
import { now, pageViewEvent } from '../test-helpers.js';

describe('validateEventBatch', () => {
  it('accepts valid CloudEvents batches', () => {
    const result = validateEventBatch(JSON.stringify([pageViewEvent()]), now);
    expect(result.ok).toBe(true);
  });

  it('rejects malformed JSON', () => {
    expect(validateEventBatch('{', now)).toEqual({ ok: false, reason: 'invalid_json' });
  });

  it('rejects schema-invalid events', () => {
    const result = validateEventBatch(JSON.stringify([{ ...pageViewEvent(), type: 'bad' }]), now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_schema');
  });
});
