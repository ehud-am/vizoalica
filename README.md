# Vizoalica

Vizoalica is an open-source, Cloudflare-native product analytics foundation for the web. It
collects privacy-filtered website activity, stores bounded raw and aggregate data, and provides a
local analytics and website-management console. It is built for inexpensive self-hosting and uses
open event, schema, and authentication standards.

- a safe embeddable browser SDK;
- a signed, high-volume ingestion Worker: CloudEvents JSON batches, JSON Schema validation,
  short-lived ingest tokens, privacy filtering before storage, and quota and abuse controls
  before any expensive work;
- Cloudflare R2 for raw event batches and D1 for bounded dashboard rollups;
- an on-demand local console for analytics and website management, whose browser never holds
  remote credentials.

> Status: early MVP. The SDK, ingestion backend, privacy-safe analytics dashboard (all-sites or
> one-site scope, five time-range presets plus a custom range, trends, rankings, distributions)
> and the local console are implemented. See the [changelog](CHANGELOG.md) for what each release
> contains.

## Get started

Already set up? Run `pnpm ops console` from your checkout. It starts the console for either
credential mode; see [Start the local operator console](docs/operations/operator-local.md).

Deploying Vizoalica has three main steps, done in this order:

1. **Deploy the Cloudflare backend** — **once per customer environment**. Follow
   [Deploy the Vizoalica backend](docs/operations/cloudflare.md).
2. **Set up each operator or data analyst's machine** — **once per operator**. Choose exactly one
   guide:
   - [Without OneCLI](docs/operations/local-analytics.md): the administrator secret lives in a
     private local file.
   - [With OneCLI](docs/operations/ops-cli.md): OneCLI injects the secret; nothing secret is
     stored locally.
3. **Activate each website** — **once per website**. Follow
   [Activate a website](docs/operations/pages.md) to register it in the console, add the browser
   SDK and token endpoint, deploy, and verify collection.

Repeat step 2 only when adding an operator and step 3 only when adding a website. Each guide is
self-contained; do not combine commands from the two operator setup options. If a check fails, use
[troubleshooting](docs/operations/troubleshooting.md) and resume at the failed step.

**Fresh deployments only.** The backend install applies one complete schema baseline to a new,
empty D1 database. It does not upgrade, adopt, or roll back an existing Vizoalica database, and
its preflight stops on any existing Vizoalica schema. To ship a newer Worker build onto an
installation that already has data, follow
[Update an existing backend](docs/operations/cloudflare.md#update-an-existing-backend).

No custom domain, paid Workers subscription, hosted dashboard, or always-on local process is
required for a small test. Review current Cloudflare pricing and configure retention and usage
alerts; included usage is not a guaranteed spending cap.

## Day to day

`pnpm ops` is the operator's single entry point. It never accepts a secret as an argument.

| Command                           | What it does                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm ops console`                | Start the private local API and the web console together (`run` is an alias).       |
| `pnpm ops status`                 | Show the credential mode, ports, and access checks without printing any secret.     |
| `pnpm ops verify`                 | Confirm authenticated access to the Worker.                                         |
| `pnpm ops doctor`                 | Check prerequisites and public Worker health (OneCLI mode).                         |
| `pnpm ops setup`                  | Save the non-secret settings for OneCLI mode.                                       |
| `pnpm ops purge-deleted`          | Dry-run; add `--apply` to permanently remove all data of deleted websites/projects. |
| `pnpm ops deploy-pages`           | Upload a Pages site with native Wrangler, then verify it.                           |
| `pnpm ops help` / `pnpm ops show` | List the commands, or where each parameter comes from.                              |

## Website integration

Use **Projects** in the console to choose the ownership boundary before opening its analytics or
websites. Adding a website always starts with an empty, required project choice; the current
browsing context is never treated as implicit confirmation.

The browser SDK and a trusted token endpoint live on your website; the Worker only accepts events.
Each registered website offers two installation options: a **Static snippet** that embeds six
public values in the page, or **Dynamic configuration**, one generic loader plus a versioned
public JSON document. This public browser configuration is not a secret; signing, administrator,
and deployment credentials stay server-side.

For a website in its own GitHub repository, the recommended deployment is the generated GitHub
Actions workflow, which needs no per-deploy manual steps and commits no analytics values. Direct
Upload and Git-connected Pages are the manual alternatives. [Website activation](docs/operations/pages.md)
covers all of them, plus consent and the accepted-event check; the
[SDK reference](docs/operations/browser-sdk.md) covers custom events and module use.

## Privacy defaults

Vizoalica avoids collecting sensitive information by default:

- no raw form values;
- no passwords, payment data, API keys, cookies, or auth headers;
- no raw URL query values;
- no page text, DOM snapshots, heatmaps, or session replay;
- custom properties are filtered by name, type, count, and value length.

Client-side filtering is a convenience, not a trust boundary: the backend also rejects
sensitive-looking payloads before persistence. Deleting a website or project is permanent; its
data is removed by the daily cleanup. See [privacy operations](docs/operations/privacy.md).

## Architecture

```text
Website
  └─ Static browser SDK or generic dynamic loader
      ├─ builds CloudEvents JSON events
      ├─ redacts URL, query, and referrer data
      ├─ queues events in memory with bounded size
      ├─ obtains a short-lived ingest token from the website's own backend
      └─ sends non-blocking event batches

Website backend
  └─ Token issuer: mints short-lived JWT/JOSE-compatible ingest tokens

Cloudflare Worker
  ├─ /healthz, /v1/events:batch, /v1/admin/*
  ├─ token verification and source/origin authorization
  ├─ CloudEvents + JSON Schema validation, event-age and token checks
  ├─ quota and payload-size enforcement, backend privacy guard
  └─ safe metrics and logging

Storage
  ├─ R2: immutable raw JSON event batches
  └─ D1: projects, websites, quotas, audit, and bounded daily/hourly/minute aggregates

Operator machine (on demand)
  ├─ React console → loopback API only
  └─ loopback API → protected Worker administration and aggregates
```

Open standards in use: [CloudEvents](https://cloudevents.io/) envelopes and batches,
[JSON Schema](https://json-schema.org/) validation, short-lived JWT/JOSE-compatible ingest
tokens, and an explicit consent state on every event.

## Documentation

| Topic                                                  | Guide                                                                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Deploy, update, and maintain the backend               | [Cloudflare backend](docs/operations/cloudflare.md)                                            |
| Operator machine, direct credential                    | [Without OneCLI](docs/operations/local-analytics.md)                                           |
| Operator machine, OneCLI-managed credential            | [With OneCLI](docs/operations/ops-cli.md)                                                      |
| Daily console startup and mode check                   | [Start the console](docs/operations/operator-local.md)                                         |
| Register, deploy, verify, and remove a website         | [Website activation](docs/operations/pages.md)                                                 |
| Browser SDK reference                                  | [Browser SDK](docs/operations/browser-sdk.md)                                                  |
| What is collected and what is not                      | [Privacy](docs/operations/privacy.md)                                                          |
| D1 and R2 cost and capacity                            | [Cost model](docs/operations/cost-model.md)                                                    |
| Something failed                                       | [Troubleshooting](docs/operations/troubleshooting.md)                                          |
| Publishing a release, and making the repository public | [Releases](docs/operations/releases.md), [public checklist](docs/operations/public-release.md) |
| Vulnerability reports, contributing, brand             | [Security](SECURITY.md), [Contributing](CONTRIBUTING.md), [Brand](docs/brand.md)               |

## Development

```bash
corepack pnpm install
corepack pnpm validate
corepack pnpm build
corepack pnpm lint
corepack pnpm format:check
```

Build a script-tag bundle separately with `pnpm browser-sdk:build`. Releases, pushes, tags, and
builds never deploy your Vizoalica Worker; an operator deploys a chosen checkout with the
[backend guide](docs/operations/cloudflare.md). A Git-connected **website** may deploy on its own
push; the [website guide](docs/operations/pages.md) explains the difference.
