# Vizoalica

Vizoalica is an open-source, Cloudflare-native product analytics foundation for the web. It
collects privacy-filtered website activity, stores bounded raw and aggregate data, and provides a
local analytics and website-management console. It is designed for inexpensive self-hosting and
uses open event, schema, and authentication standards.

The current work focuses on:

- a safe embeddable browser SDK;
- a signed, high-volume event ingestion backend;
- CloudEvents JSON batches;
- JSON Schema validation;
- short-lived ingest tokens for production traffic;
- privacy filtering before storage;
- quota and abuse controls before expensive processing;
- Cloudflare R2 raw-event storage and bounded D1 dashboard rollups;
- an on-demand local analytics and website-management console whose browser never owns remote
  credentials.

> Status: early MVP implementation. The SDK, ingestion data plane, a full privacy-safe analytics
> dashboard (all-sites/one-site scope, five time-range presets plus a custom range, trends,
> rankings, distributions), and a themeable local operations console are implemented and under
> active validation.

## Start here

Already configured? Use [Start the local operator console](docs/operations/operator-local.md) to
identify the saved credential mode, check status, and run the correct daily startup command.

Deploying Vizoalica has three main steps:

1. **Deploy the Cloudflare backend** — run this **once per customer environment**. Follow
   [Deploy the Vizoalica backend](docs/operations/cloudflare.md).
2. **Set up each operator or data analyst's machine** — run this **once per operator**. Choose
   exactly one guide:
   - [Without OneCLI](docs/operations/local-analytics.md)
   - [With OneCLI](docs/operations/ops-cli.md)
3. **Activate each website** — run this **once per website**. Follow
   [Activate a website](docs/operations/pages.md) to create its website ID in the local
   console, add the browser SDK and token endpoint, deploy, and verify collection.

Complete the steps in order. Repeat only step 2 when adding an operator and only step 3 when
adding a website. Each linked guide is self-contained; do not combine commands from the two
operator setup options.

Version 0.5.2 supports **fresh deployments only**. Backend deployment applies one complete schema
baseline to a new empty D1 database. It does not upgrade, adopt, backfill, preserve, or roll back an
existing Vizoalica database. Preflight detects existing or ambiguous schema state and stops without
changing it; select a new empty database rather than deleting the old one.

Keep credentials in their intended lanes: Cloudflare deployment authority is separate from the
Worker administrator credential, and neither belongs in browser code. Website activation uses the
website's existing Git deployment or an explicit Wrangler upload.

No custom domain, paid Workers subscription, hosted dashboard, or always-on local process is
required for a small test. Review current Cloudflare pricing and configure retention and usage
alerts; included usage is not a guaranteed spending cap.

If a checkpoint fails, use [troubleshooting](docs/operations/troubleshooting.md) and resume at that
story's failed step rather than entering another setup journey.

## Website integration

Use **Projects** in the local console to choose the ownership boundary before opening its analytics
or websites. Adding a website always starts with an empty, required project choice; the current
browsing context is never treated as implicit confirmation.

The browser SDK and trusted token endpoint live on your website; the Worker accepts events. Every
registered website offers two installation entry points: **Static snippet** embeds its six public
values directly, while **Dynamic configuration** uses one generic loader plus the same versioned
public JSON contract on Cloudflare Pages or another host. This public browser configuration is not
a secret; signing, administrator, and deployment credentials remain server-side.
[Website activation](docs/operations/pages.md) covers registration, deployment, consent, and the
accepted-event check. After activation, use the [SDK reference](docs/operations/browser-sdk.md)
for custom events or module integration. Never put signing secrets or administrator credentials
in browser code.

## Privacy defaults

Vizoalica avoids collecting sensitive information by default:

- no raw form values;
- no passwords, payment data, API keys, cookies, or auth headers;
- no raw URL query values;
- no page text, DOM snapshots, heatmaps, or session replay;
- custom properties are filtered by name, type, count, and value length.

Client-side filtering is convenience, not a trust boundary. The ingestion backend also rejects sensitive-looking payloads before persistence.

See [docs/operations/privacy.md](docs/operations/privacy.md).

## High-level architecture

```text
Website
  └─ Static Browser SDK or generic dynamic loader
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
