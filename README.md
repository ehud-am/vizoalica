# Vizoalica

Vizoalica is an open-source, Cloudflare-native product analytics foundation for the web.
It aims to provide Pendo-like visibility into website and product activity while staying inexpensive to deploy, privacy-aware by default, and built on open standards.

The current work focuses on:

- a safe embeddable browser SDK;
- a signed, high-volume event ingestion backend;
- CloudEvents JSON batches;
- JSON Schema validation;
- short-lived ingest tokens for production traffic;
- privacy filtering before storage;
- quota and abuse controls before expensive processing;
- Cloudflare R2 raw-event storage and bounded D1 dashboard rollups.
- an on-demand local analytics and website-management console whose browser never owns remote
  credentials.

> Status: early MVP implementation. The SDK, ingestion data plane, a full privacy-safe analytics
> dashboard (all-sites/one-site scope, five time-range presets plus a custom range, trends,
> rankings, distributions), and a themeable local operations console are implemented and under
> active validation.

## Start here

Follow the **[step-by-step installation guide](docs/operations/cloudflare.md)**. It takes you from
Cloudflare login to a verified page view, with a check after each step.

For the shortest repeatable path after the ingestion Worker exists, use the
**[guided operations CLI](docs/operations/ops-cli.md)**. `pnpm ops setup` explains where each
non-secret value comes from, `pnpm ops doctor` checks the setup, `pnpm ops run` starts the private
console, and `pnpm ops deploy-pages` safely handles Direct Upload websites.

1. Deploy the ingestion Worker, D1 database and R2 bucket.
2. Connect your website using the **[complete Pages example](docs/operations/pages.md)**: build
   and host the SDK, add the supplied token Function, then verify both.
3. Open the **[local console](docs/operations/local-analytics.md)** when you need it. Keep its
   administrator secret in a local OneCLI vault, or use the documented private-file alternative.
   The console's [dashboard tour](docs/operations/local-analytics.md#dashboard-tour) covers scope
   and time-range selection, what "Unknown" and "Other" mean, identity modes, theme, and browser
   support.

The simplest deployment uses Cloudflare login and the included `workers.dev`/`pages.dev` addresses.
You can use OneCLI for the local console independently of deployment. No custom domain, paid
Workers subscription, or hosted dashboard is required for a small test. R2 has included usage
but can charge for excess usage; the guide explains quotas and retention.

**Already tried an installation?** Start with [troubleshooting](docs/operations/troubleshooting.md).
It covers all 18 findings from the first Cloudflare + OneCLI deployment.

## Website integration

The browser SDK and token endpoint live on **your website**; the Worker accepts events.
After hosting both pieces using the Pages recipe, the local console generates a complete snippet:

```html
<script
  async
  src="/vizoalica.js"
  data-endpoint="https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev/v1/events:batch"
  data-source="YOUR_PUBLIC_SOURCE_KEY"
  data-project="YOUR_PROJECT_ID"
  data-token-url="/vizoalica/ingest-token"
  data-consent="analytics-granted"
></script>
```

Load this only after the visitor grants analytics consent. The consent attribute records the
choice; it does not itself prevent collection. The included example waits for an Allow button.
Never embed signing secrets or administrator credentials in the website. A static site needs a
server-side token endpoint; adding the script tag alone does not complete installation.

The SDK queues and sends events asynchronously. Delivery failures should leave the host website
usable. See the [SDK reference](docs/operations/browser-sdk.md) for custom events and module usage.

## Privacy defaults

Vizoalica avoids collecting sensitive information by default:

- no raw form values;
- no passwords, payment data, API keys, cookies, or auth headers;
- no raw URL query values;
- no page text, DOM snapshots, heatmaps, or session replay in v0.1.0;
- custom properties are filtered by name, type, count, and value length.

Client-side filtering is convenience, not a trust boundary. The ingestion backend also rejects sensitive-looking payloads before persistence.

See [docs/operations/privacy.md](docs/operations/privacy.md).

## High-level architecture

```text
Website
  └─ Browser SDK
      ├─ builds CloudEvents JSON events
      ├─ redacts URL/query/referrer data
      ├─ queues events in memory with bounded size
      ├─ obtains short-lived ingest token from customer backend
      └─ sends non-blocking event batches

Customer backend
  └─ Token issuer
      └─ mints short-lived JWT/JOSE-compatible ingest tokens

Cloudflare Worker
  ├─ /healthz
  ├─ /v1/events:batch
  ├─ token verification
  ├─ source/origin authorization
  ├─ CloudEvents + JSON Schema validation
  ├─ token constraints and event-age checks
  ├─ quota and payload-size enforcement
  ├─ backend privacy guard
  ├─ safe metrics/logging
  └─ event repository abstraction

Operator machine (on demand)
  ├─ React console → loopback API only
  └─ loopback API → protected Worker administration and aggregates

Storage / dashboard data
  ├─ R2 immutable raw JSON event batches
  └─ D1 bounded daily and hourly dashboard aggregates
```

## Standards direction

Vizoalica prefers open standards and interoperable formats:

- [CloudEvents](https://cloudevents.io/) for event envelopes and batches;
- [JSON Schema](https://json-schema.org/) for event validation;
- JWT/JOSE-compatible short-lived ingest tokens;
- optional W3C Trace Context compatibility in later tasks;
- explicit consent state on analytics events.

## Development

```bash
corepack pnpm install
corepack pnpm validate
corepack pnpm build
corepack pnpm lint
corepack pnpm format:check
```

Build a script-tag bundle separately with `pnpm browser-sdk:build`.

Releases, pushes, tags and builds never deploy your Vizoalica Worker automatically. Deploy an
operator-selected checkout using the [installation guide](docs/operations/cloudflare.md). Existing
Git-connected **website** projects may have their own automatic Pages deployments; the
[Pages recipe](docs/operations/pages.md) explains the distinction.

See [release operations](docs/operations/releases.md), [security policy](SECURITY.md), and
[contribution guide](CONTRIBUTING.md) for public project maintenance.
