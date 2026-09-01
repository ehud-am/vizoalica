# Vizoalica

Vizoalica is an open-source, Cloudflare-native product analytics foundation for the web.
It aims to provide Pendo-like visibility into website and product activity while staying inexpensive to deploy, privacy-aware by default, and built on open standards.

The current v0.1.0 work focuses on:

- a safe embeddable browser SDK;
- a signed, high-volume event ingestion backend;
- CloudEvents JSON batches;
- JSON Schema validation;
- short-lived ingest tokens for production traffic;
- privacy filtering before storage;
- quota and abuse controls before expensive processing;
- Cloudflare R2 raw-event storage and bounded D1 dashboard rollups.

> Status: early MVP implementation. The SDK, shared contracts, privacy utilities, ingestion pipeline, R2 event storage, and D1 dashboard rollups are under active development.

## Cloudflare deployment

Prerequisites:

- Node.js 22+
- Corepack-enabled pnpm

```bash
git clone https://github.com/ehud-am/vizoalica.git
cd vizoalica
corepack enable
corepack pnpm install
corepack pnpm validate
corepack pnpm build
```

Vizoalica releases never deploy into a Cloudflare account automatically. Deploy the Worker, D1 schema, and R2 bucket only from an operator-controlled checkout using the [Cloudflare operations guide](docs/operations/cloudflare.md). Self-hosted and other cloud profiles are deferred beyond v0.1.

## Quick website implementation

Add one script tag to your website, similar to Google Analytics-style installs:

```html
<script
  async
  src="https://analytics.example.com/vizoalica.js"
  data-endpoint="https://analytics.example.com/v1/events:batch"
  data-source="public_source_key"
  data-project="project_id"
  data-token-url="/vizoalica/ingest-token"
  data-consent="analytics-granted"
></script>
```

That is enough for the default page-view tracking path. The script loads asynchronously, reads its own `data-*` attributes, obtains a short-lived ingest token from `data-token-url`, and sends non-blocking CloudEvents batches to the backend.

Track a custom event later from page code if needed:

```html
<script>
  window.vizoalica?.track('signup_click', {
    properties: {
      plan: 'pro'
    }
  });
</script>
```

Production websites should mint short-lived ingest tokens from their own backend at the configured `data-token-url`. Never place long-lived signing secrets in browser code.

If Vizoalica is down, slow, blocked, or misconfigured, the SDK is designed to fail silently so the host website keeps operating.

## MVP dashboard data

The Worker retains immutable raw batches in R2 and writes bounded daily D1 rollups by project, source, event type, and page path. These rollups support basic dashboard totals without making D1 the raw-event store.

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

Storage / dashboard data
  ├─ R2 immutable raw JSON event batches
  └─ D1 bounded daily dashboard rollups
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

For a self-hosted deployment, first create an operator-owned configuration, then run the explicit deployment commands:

```bash
cp deploy/cloudflare/wrangler.example.toml deploy/cloudflare/wrangler.production.toml
# Edit wrangler.production.toml with your D1 database ID and resource names.
pnpm run deploy:check
pnpm run deploy:apply
VIZOALICA_WORKER_URL=https://your-worker.example pnpm run deploy:verify
```

`wrangler.production.toml` is gitignored. Nothing is deployed by a build, test, merge, tag, or release.

Current validation status includes unit, contract, integration, and load smoke coverage for the SDK, contracts, privacy utilities, and ingestion pipeline.

The v0.1.0 deployment uses a Worker for ingestion, D1 for configuration, quota state, and dashboard rollups, and R2 for immutable accepted batches. See [Cloudflare operations](docs/operations/cloudflare.md).
