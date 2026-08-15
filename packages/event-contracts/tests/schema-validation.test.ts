import { describe, expect, it } from 'vitest';
import {
  compileBatchValidator,
  createValidator,
  schemas,
  type CloudEvent,
  type PageViewData
} from '../src/index.js';

const pageViewEvent: CloudEvent<PageViewData> = {
  specversion: '1.0',
  id: 'evt_12345678',
  type: 'com.vizoalica.page_view.v1',
  source: 'https://example.com',
  subject: 'project/proj_1/session/sess_1',
  time: new Date().toISOString(),
  datacontenttype: 'application/json',
  vizoalicaproject: 'proj_1',
  vizoalicasource: 'src_1',
  vizoalicaauth: 'signed-session',
  vizoalicaconsent: 'analytics-granted',
  data: {
    page: {
      url_origin: 'https://example.com',
      url_path: '/pricing',
      url_query_redacted: true,
      title: null
    },
    visitor: { anonymous_id: 'anon_1' },
    session: { id: 'sess_1' }
  }
};

describe('event contracts', () => {
  it('accepts a valid CloudEvents page-view batch', () => {
    const validate = compileBatchValidator();
    expect(validate([pageViewEvent])).toBe(true);
  });

  it('rejects unsupported event types', () => {
    const validate = compileBatchValidator();
    expect(validate([{ ...pageViewEvent, type: 'not.allowed' }])).toBe(false);
  });

  it('accepts valid token claims', () => {
    const ajv = createValidator();
    const validate = ajv.compile(schemas.tokenClaims);
    expect(
      validate({
        iss: 'https://customer.example',
        aud: 'vizoalica-ingest',
        sub: 'session/sess_1',
        project_id: 'proj_1',
        source_id: 'src_1',
        origin: 'https://example.com',
        scope: 'events:write',
        iat: 1,
        nbf: 1,
        exp: 2,
        jti: 'token_1',
        max_events: 10
      })
    ).toBe(true);
  });
});
