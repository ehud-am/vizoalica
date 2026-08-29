# Vizoalica

Vizoalica is an open-source, self-hosted product analytics foundation for the web.
It aims to provide Pendo-like visibility into website and product activity while staying inexpensive to deploy, privacy-aware by default, and built on open standards.

The current v0.1.0 work focuses on:

- a safe embeddable browser SDK;
- a signed, high-volume event ingestion backend;
- CloudEvents JSON batches;
- JSON Schema validation;
- short-lived ingest tokens for production traffic;
- privacy filtering before storage;
- quota and abuse controls before expensive processing;
- bounded in-memory Parquet chunk buffering for cheap analytics-ready object storage.

> Status: early MVP implementation. The SDK, shared contracts, privacy utilities, ingestion pipeline, Parquet chunk sink, and DuckDB analytics CLI are under active development.

## Quick backend install

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

Start the local ingestion backend:

```bash
VIZOALICA_PORT=4318 \
VIZOALICA_TOKEN_SECRET=dev-secret \
VIZOALICA_STORAGE_ROOT=./.vizoalica/events \
VIZOALICA_STORAGE_FORMAT=parquet \
corepack pnpm --filter @vizoalica/ingest-api start
```

Health check:

```bash
curl http://localhost:4318/healthz
```

Expected response:

```json
{ "ok": true, "service": "vizoalica-ingest-api" }
```

The v0.1.0 backend defaults to an in-memory repository for local validation. Set `VIZOALICA_STORAGE_ROOT=/path/to/events` to enable the default Parquet chunk sink; set `VIZOALICA_STORAGE_FORMAT=jsonl-gzip` only for the legacy raw JSONL gzip path. Low-volume local runs flush buffered storage every `VIZOALICA_STORAGE_FLUSH_INTERVAL_MS` milliseconds, default 60 seconds.

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

## MVP analytics analysis

After events have flushed to Parquet chunks, run the DuckDB-powered analytics CLI:

```bash
corepack pnpm build
corepack pnpm analyze -- \
  --storage-root ./.vizoalica/events \
  --project-id proj_1 \
  --date 2026-08-23
```

The MVP summary includes total events, page views, visitor/session counts, events by type, and page views by path. DuckDB reads the Parquet files directly, so the default self-hosted stack does not need BigQuery, ClickHouse, Postgres, or an always-on analytics warehouse.

## Privacy defaults

Vizoalica avoids collecting sensitive information by default:

- no raw form values;
- no passwords, payment data, API keys, cookies, or auth headers;
- no raw URL query values;
- no page text, DOM snapshots, heatmaps, or session replay in v0.1.0;
- custom properties are filtered by name, type, count, and value length.

Client-side filtering is convenience, not a trust boundary. The ingestion backend also rejects sensitive-looking payloads before persistence.

See [docs/operations/privacy.md](docs/operations/privacy.md).

## Hosting on GCP

For a cheap and simple GCP deployment plan, see [docs/operations/gcp-hosting.md](docs/operations/gcp-hosting.md).

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

Vizoalica ingest API
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

Storage / processing
  ├─ bounded in-memory accepted-event buffer
  ├─ partitioned Parquet chunks at rest
  ├─ optional JSONL gzip fallback adapter
  └─ DuckDB analytics CLI for MVP summaries
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

Current validation status includes unit, contract, integration, and load smoke coverage for the SDK, contracts, privacy utilities, and ingestion pipeline.

## Cloudflare deployment

The v0.1.0 Cloudflare profile uses a Worker for ingestion, D1 for configuration and quota state, and R2 for immutable accepted batches. See [Cloudflare operations](docs/operations/cloudflare.md).
