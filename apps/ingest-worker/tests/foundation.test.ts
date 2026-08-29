import { describe, expect, it } from 'vitest';
import { loadWorkerConfig } from '../src/config.js';

describe('Worker configuration', () => {
  it('requires D1, R2, and token bindings', () => {
    expect(() => loadWorkerConfig({} as never)).toThrow('missing_required_cloudflare_binding');
  });
  it('rejects invalid request limits', () => {
    expect(() =>
      loadWorkerConfig({
        VIZOALICA_DB: {},
        VIZOALICA_EVENTS: {},
        VIZOALICA_TOKEN_SECRET: 'x',
        VIZOALICA_MAX_REQUEST_BYTES: '0'
      } as never)
    ).toThrow('invalid_max_request_bytes');
  });
});
