# Browser SDK

The v0.1.0 browser SDK is designed to be safe to embed in ordinary web pages.

## Guarantees

- Loading and delivery are non-blocking.
- Events are held in a bounded in-memory queue.
- Delivery failures are swallowed so analytics never breaks the host website.
- Query values, referrers, and custom properties are minimized before delivery.
- Browser code can receive short-lived ingest tokens, but must never receive signing secrets.

## Minimal usage

```ts
import { init } from '@vizoalica/browser-sdk';

const client = init({
  endpoint: 'https://analytics.example.com/v1/events:batch',
  sourceKey: 'public_source_key',
  projectId: 'project_id',
  tokenProvider: async () => fetch('/vizoalica-token').then((r) => r.text()),
  consentState: 'analytics-granted'
});

client.track('signup_click', { properties: { plan: 'pro' } });
```

If the endpoint is down or blocked, the website continues to operate. Production ingestion should use short-lived server-issued tokens; unsigned ingestion is only for explicitly configured demo/development mode.
