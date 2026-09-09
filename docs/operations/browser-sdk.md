# Browser SDK

Build the standalone bundle with `pnpm browser-sdk:build`, then host
`packages/browser-sdk/dist/vizoalica.js` on your **website**. The ingestion Worker does not serve
this file. For a complete working installation, use the [Pages recipe](pages.md).

## Recommended embed

Use one async script tag with your actual Worker URL and public identifiers. Load it only after
analytics consent is granted, setting `data-consent="analytics-granted"` then. `unknown` below is
a placeholder, not an automatic collection gate; the SDK records the supplied state and does
not implement a consent banner or suppression policy.

```html
<script
  async
  src="/vizoalica.js"
  data-endpoint="https://analytics.example.com/v1/events:batch"
  data-source="public_source_key"
  data-project="project_id"
  data-token-url="/vizoalica/ingest-token"
  data-consent="unknown"
></script>
```

The script reads its own `data-*` attributes and initializes itself. By default it sends a page-view event and exposes the client as `window.vizoalica`.

Optional custom event:

```html
<script>
  window.vizoalica?.track('signup_click', {
    properties: {
      plan: 'pro'
    }
  });
</script>
```

## Data attributes

| Attribute             | Required    | Description                                                                  |
| --------------------- | ----------- | ---------------------------------------------------------------------------- |
| `data-endpoint`       | Yes         | Ingestion endpoint, usually `/v1/events:batch`.                              |
| `data-source`         | Yes         | Public source key used for routing. This is not a secret.                    |
| `data-project`        | Recommended | Project identifier to include on client-built events.                        |
| `data-token-url`      | Production  | Same-origin endpoint that returns a short-lived ingest token.                |
| `data-consent`        | Recommended | Consent state such as `analytics-granted`, `analytics-denied`, or `unknown`. |
| `data-auto-page-view` | No          | Set to `false` to disable automatic page-view tracking.                      |

## Guarantees

- Loading and delivery are non-blocking.
- Events are held in a bounded in-memory queue.
- Delivery failures are swallowed so analytics never breaks the host website.
- Query values, referrers, and custom properties are minimized before delivery.
- Browser code can receive short-lived ingest tokens, but must never receive signing secrets.

## Module usage for advanced integrations

```ts
import { init } from '@vizoalica/browser-sdk';

const client = init({
  endpoint: 'https://analytics.example.com/v1/events:batch',
  sourceKey: 'public_source_key',
  projectId: 'project_id',
  tokenProvider: async () => fetch('/vizoalica/ingest-token').then((r) => r.text()),
  consentState: 'analytics-granted'
});

client.track('signup_click', { properties: { plan: 'pro' } });
```

Production ingestion should use short-lived server-issued tokens; unsigned ingestion is only for explicitly configured demo/development mode.

For the Cloudflare profile, set `endpoint` to the deployed Worker URL ending in `/v1/events:batch` and provide the short-lived token through `tokenProvider`.
