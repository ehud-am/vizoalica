# Browser SDK

This is the advanced SDK reference. For a complete registration, trusted token issuer, deployment,
consent, accepted-event check, and removal flow, follow [website activation](pages.md) once per
website.

Build both standalone assets with `pnpm browser-sdk:build`, then host
`packages/browser-sdk/dist/vizoalica.js` and, when using dynamic configuration,
`packages/browser-sdk/dist/vizoalica-loader.js` on your **website**. The ingestion Worker does not
serve these files.

## Choose one installation mode

The console provides exactly two options. Do not enable both on one page.

- **Static snippet** is the compatibility path. It embeds `src`, `data-endpoint`, `data-source`,
  `data-project`, `data-token-url`, and `data-consent` directly in website-specific markup.
- **Dynamic configuration** uses the byte-identical generic markup below on every website. The
  loader reads the six public values from a versioned, same-origin JSON response. Cloudflare Pages
  can map plaintext environment variables through the included Function; other hosts can use a
  function, application route, configuration service, or generated public JSON asset.

```html
<script async src="/vizoalica-loader.js"></script>
```

The dynamic host must serve `GET /vizoalica/config.json` as `application/json` with
`Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. Version 1 contains only `version`
and the six fields above. Missing, partial, malformed, cross-origin token, insecure production, or
unsupported configuration fails closed without loading the SDK or affecting the host page.

## Recommended embed

Use one async script tag with your actual Worker URL and public identifiers. Insert it only after
analytics consent is granted. The SDK records `data-consent`; the attribute is not itself a
consent gate.

```html
<script
  async
  src="/vizoalica.js"
  data-endpoint="https://analytics.example.com/v1/events:batch"
  data-source="public_source_key"
  data-project="project_id"
  data-token-url="/vizoalica/ingest-token"
  data-consent="analytics-granted"
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
- Dynamic loading initializes at most once and never falls back to another project, source, or
  endpoint.

For CSP-restricted sites, allow the website-hosted SDK/loader in `script-src`, the analytics Worker
in `connect-src`, and the same-origin config/token routes in `connect-src 'self'`. Switching modes
requires removing the old load path, deploying the new assets/configuration, reviewing the
effective public values, and verifying an accepted consented event. If dynamic configuration is
unavailable, keep the website usable, correct all six values, and redeploy; do not add defaults.

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
