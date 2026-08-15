import { describe, expect, it } from 'vitest';
import { createRequestHandler } from '../../src/http/server.js';
import { createRepositories, now, pageViewEvent, secret, token } from '../test-helpers.js';

function request(body: unknown, authorization = `Bearer ${token()}`): Request {
  return new Request('http://localhost/v1/events:batch', {
    method: 'POST',
    headers: {
      origin: 'https://example.com',
      'x-vizoalica-source': 'public_src_1',
      authorization,
      'content-type': 'application/cloudevents-batch+json'
    },
    body: JSON.stringify(body)
  });
}

describe('POST /v1/events:batch contract', () => {
  it('returns 202 for a signed valid CloudEvents batch', async () => {
    const handler = createRequestHandler({
      repositories: createRepositories(),
      tokenSecret: secret
    });
    const response = await handler(request([pageViewEvent()]));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      decision: 'accepted',
      accepted_count: 1,
      rejected_count: 0
    });
  });

  it('returns 401 for missing production ingest token', async () => {
    const handler = createRequestHandler({
      repositories: createRepositories(),
      tokenSecret: secret
    });
    const response = await handler(request([pageViewEvent()], ''));
    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid event schema', async () => {
    const handler = createRequestHandler({
      repositories: createRepositories(),
      tokenSecret: secret
    });
    const response = await handler(
      request([{ ...pageViewEvent(), time: now.toISOString(), type: 'bad' }])
    );
    expect(response.status).toBe(400);
  });
});
