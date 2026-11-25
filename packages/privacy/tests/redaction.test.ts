import { describe, expect, it } from 'vitest';
import { redactLabel, redactReferrer, redactUrl, sanitizeProperties } from '../src/index.js';

describe('privacy redaction', () => {
  it('keeps origin/path and redacts query values', () => {
    expect(redactUrl('https://example.com/pricing?token=secret&utm=ok')).toEqual({
      url_origin: 'https://example.com',
      url_path: '/pricing',
      url_query_redacted: true
    });
  });

  it('minimizes referrer to origin', () => {
    expect(redactReferrer('https://ref.example/path?email=a@example.com')).toEqual({
      origin: 'https://ref.example'
    });
  });

  it('drops forbidden properties and keeps safe scalars', () => {
    expect(
      sanitizeProperties({ plan: 'pro', token: 'secret', count: 2, nested: { no: true } })
    ).toEqual({ plan: 'pro', count: 2 });
  });
});

describe('redactLabel length', () => {
  it('cuts to the action-name limit by default and to a longer limit on request', () => {
    const long = 'word '.repeat(80);
    expect(redactLabel(long)).toHaveLength(79);
    expect(redactLabel(long, 256).length).toBeGreaterThan(200);
    expect(redactLabel(long, 256).length).toBeLessThanOrEqual(256);
  });
});
