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

const actionEvent = {
  specversion: '1.0',
  id: 'evt_action_1',
  type: 'com.vizoalica.action.v1',
  source: 'https://example.com',
  time: new Date().toISOString(),
  datacontenttype: 'application/json',
  data: {
    page: { url_origin: 'https://example.com', url_path: '/#/pricing' },
    action: { name: 'Start free trial', kind: 'link' },
    visitor: { anonymous_id: 'anon_1' },
    session: { id: 'sess_1' }
  }
};

describe('action event contract', () => {
  const validate = compileBatchValidator();
  const withData = (patch: (data: Record<string, any>) => void) => {
    const copy = JSON.parse(JSON.stringify(actionEvent));
    patch(copy.data);
    return copy;
  };

  it('accepts the rage flag as true only', () => {
    expect(validate([withData((data) => (data.action.rage = true))])).toBe(true);
    expect(validate([withData((data) => (data.action.rage = false))])).toBe(false);
    expect(validate([withData((data) => (data.action.rage = 'yes'))])).toBe(false);
    expect(validate([withData((data) => (data.action.rage = 3))])).toBe(false);
  });

  it('accepts a valid action event, with and without a link destination', () => {
    expect(validate([actionEvent])).toBe(true);
    expect(
      validate([
        withData((data) => {
          data.action.destination = { url_origin: 'https://app.example.com', url_path: '/signup' };
        })
      ])
    ).toBe(true);
  });

  it('rejects unknown fields, missing fields, bad kinds, and bad names', () => {
    expect(validate([withData((data) => (data.extra = true))])).toBe(false);
    expect(validate([withData((data) => (data.action.extra = true))])).toBe(false);
    expect(validate([withData((data) => delete data.action.kind)])).toBe(false);
    expect(validate([withData((data) => (data.action.kind = 'menu'))])).toBe(false);
    expect(validate([withData((data) => (data.action.name = ''))])).toBe(false);
    expect(validate([withData((data) => (data.action.name = 'x'.repeat(81)))])).toBe(false);
    expect(validate([withData((data) => delete data.page.url_path)])).toBe(false);
    expect(validate([withData((data) => delete data.visitor)])).toBe(false);
    expect(validate([withData((data) => (data.action.destination = { url_path: '/x' }))])).toBe(
      false
    );
  });

  it('keeps existing page-view and custom-event events valid and matches exactly one branch', () => {
    const custom = {
      ...pageViewEvent,
      type: 'com.vizoalica.custom_event.v1',
      data: {
        name: 'signup_click',
        properties: { plan: 'pro' },
        visitor: { anonymous_id: 'anon_1' },
        session: { id: 'sess_1' }
      }
    };
    expect(validate([pageViewEvent, custom, actionEvent])).toBe(true);
    // A custom event may carry the page it was sent from, and nothing else about it.
    const withPage = (page: unknown) => ({ ...custom, data: { ...custom.data, page } });
    expect(validate([withPage({ url_path: '/pricing' })])).toBe(true);
    expect(validate([withPage({ url_path: '/pricing', url_origin: 'https://x.test' })])).toBe(
      false
    );
    expect(validate([withPage({ url_path: 'x'.repeat(1025) })])).toBe(false);
    expect(validate([withPage({})])).toBe(false);
    // An action carrying page-view fields, or a page view carrying an action, matches no branch.
    expect(
      validate([
        withData((data) => {
          data.page.url_query_redacted = false;
        })
      ])
    ).toBe(false);
    expect(
      validate([
        { ...pageViewEvent, data: { ...pageViewEvent.data, action: actionEvent.data.action } }
      ])
    ).toBe(false);
  });
});

describe('page-view campaign labels', () => {
  const validate = compileBatchValidator();
  const withCampaign = (campaign: unknown) => ({
    ...pageViewEvent,
    data: { ...pageViewEvent.data, campaign }
  });

  it('accepts one to three labels', () => {
    expect(validate([withCampaign({ source: 'newsletter' })])).toBe(true);
    expect(validate([withCampaign({ source: 'a', medium: 'b', campaign: 'c' })])).toBe(true);
  });

  it('rejects an empty object, empty or long values, wrong types, and other keys', () => {
    expect(validate([withCampaign({})])).toBe(false);
    expect(validate([withCampaign({ source: '' })])).toBe(false);
    expect(validate([withCampaign({ source: 'x'.repeat(65) })])).toBe(false);
    expect(validate([withCampaign({ source: 5 })])).toBe(false);
    expect(validate([withCampaign({ term: 'shoes' })])).toBe(false);
    expect(validate([withCampaign('utm_source=x')])).toBe(false);
  });

  it('is not accepted on other event types', () => {
    const custom = {
      ...pageViewEvent,
      type: 'com.vizoalica.custom_event.v1',
      data: {
        name: 'x',
        campaign: { source: 'a' },
        visitor: { anonymous_id: 'a' },
        session: { id: 's' }
      }
    };
    expect(validate([custom])).toBe(false);
  });
});
