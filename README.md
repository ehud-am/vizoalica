# Vizoalica

Vizoalica is an open-source, Cloudflare-native product analytics foundation for the web. It
collects privacy-filtered website activity, stores bounded raw and aggregate data, and gives you a
local console to read the analytics and manage your websites. It is built for inexpensive
self-hosting and uses open event, schema, and authentication standards.

> Status: early MVP. The SDK, ingestion backend, privacy-safe analytics dashboard (all-sites or
> one-site scope, five time-range presets plus a custom range, trends, rankings, distributions)
> and the local console are implemented. See the [changelog](CHANGELOG.md) for what each release
> contains.

## The three parts

A Vizoalica installation has three parts. You set each one up once, in this order.

```text
   Website  ──── events ────▶  Backend (Cloudflare)  ◀──── admin API ────  Console (your computer)
   browser SDK                 Worker + D1 + R2                            local API + web UI
   + token endpoint
```

| Part        | Where it runs                          | What it does                                                                                                           |
| ----------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Backend** | Your Cloudflare account                | Receives signed event batches, filters and validates them, and stores raw events (R2) and bounded aggregates (D1).     |
| **Console** | An operator's computer, only on demand | A local web app for creating projects and websites and reading analytics. Its browser never holds a remote credential. |
| **Website** | Wherever your site is hosted           | Loads the browser SDK and a small token endpoint that lets visitors' browsers send events to the backend.              |

Three secrets keep it safe, and none of them is ever in browser code:

| Secret                              | Held by                                                    |
| ----------------------------------- | ---------------------------------------------------------- |
| `VIZOALICA_TOKEN_SECRET`            | The Worker and your website's token endpoint (server side) |
| `VIZOALICA_ADMIN_SECRET`            | The Worker and each operator's console                     |
| `VIZOALICA_ANALYTICS_DIGEST_SECRET` | The Worker only                                            |

## Get started

You need Node.js 22 or newer, Git, and a Cloudflare account with Workers, D1, and R2 available.
Every part builds from a checkout of this repository; see [Build from source](#build-from-source)
first if you have not made one. The checkout and console are tested on macOS and Linux; Windows is
not supported yet, because the console's private-file permission checks and the deploy scripts
assume a POSIX system.

### 1. Backend — once per environment

Generate three different random secrets (32 or more characters each) in a password manager, then:

```sh
cp deploy/cloudflare/wrangler.example.toml deploy/cloudflare/wrangler.production.toml
pnpm exec wrangler login
pnpm exec wrangler d1 create vizoalica-config       # copy the returned id into wrangler.production.toml
pnpm exec wrangler r2 bucket create vizoalica-events
pnpm exec wrangler secret put VIZOALICA_TOKEN_SECRET --config deploy/cloudflare/wrangler.production.toml
pnpm exec wrangler secret put VIZOALICA_ADMIN_SECRET --config deploy/cloudflare/wrangler.production.toml
pnpm exec wrangler secret put VIZOALICA_ANALYTICS_DIGEST_SECRET --config deploy/cloudflare/wrangler.production.toml
pnpm deploy:check && pnpm deploy:apply
```

Then confirm it is healthy with
`VIZOALICA_WORKER_URL=https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev pnpm deploy:verify`. This is a
**fresh install only**: it needs a new, empty D1 database and stops on any existing Vizoalica
data. To ship a newer build to a backend that already has data, use
[Update an existing backend](docs/operations/cloudflare.md#update-an-existing-backend).

Full guide: **[docs/operations/cloudflare.md](docs/operations/cloudflare.md)**.

### 2. Console — once per operator

The default keeps the administrator secret in a private file on your computer (`0600`, outside the
repository). It prompts for the secret; it is never a command argument.

```sh
mkdir -p "$HOME/.config/vizoalica" && chmod 700 "$HOME/.config/vizoalica"
pnpm --filter @vizoalica/local-ops-api dev configure \
  "$HOME/.config/vizoalica/local-operations.json" https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev
pnpm ops console            # then open http://127.0.0.1:5173
```

> **OneCLI is supported and is the more secure option.** With [OneCLI](https://onecli.sh) the
> administrator secret is held by the gateway and injected into requests to your Worker, so it is
> never written to a file on the operator's machine. It takes a few more setup steps and is not
> the default. `pnpm ops console` starts the console the same way in either mode.

Full guides: **[without OneCLI](docs/operations/local-analytics.md)** (the default above) or
**[with OneCLI](docs/operations/ops-cli.md)**. Returning operators: see
[Start the local operator console](docs/operations/operator-local.md).

### 3. Website — once per website

In the console, open **Projects**, choose or create a project, then **Websites → Add website**
(every website starts with an empty, required project choice) and enter its exact production
origin. Its integration panel then gives you everything to paste:

1. For a site in its own GitHub repository: the generated GitHub Actions workflow and the
   repository variables and secrets it needs. Add them and push; the workflow deploys the site
   to Cloudflare Pages together with Vizoalica's loader and its configuration and token
   endpoints.
2. Open the site, grant analytics consent, and watch the page view appear in the console's `24h`
   view.

The panel offers two install options: a **Static snippet** that embeds six public values in the
page, or **Dynamic configuration**, one generic loader plus a versioned public JSON document. This
public browser configuration is not a secret. Direct Upload and Git-connected Pages are the manual
alternatives.

Full guide: **[docs/operations/pages.md](docs/operations/pages.md)**; SDK reference:
[docs/operations/browser-sdk.md](docs/operations/browser-sdk.md).

If a step fails, see [troubleshooting](docs/operations/troubleshooting.md) and resume at that step.

## Build from source

Vizoalica is distributed as source. Nothing is published to npm or another registry, and every
part is built from this repository. You need Node.js 22 or newer, Git, and Corepack, which supplies
the pinned pnpm (9.15.4).

```sh
git clone https://github.com/ehud-am/vizoalica.git && cd vizoalica
git checkout YOUR_APPROVED_TAG_OR_COMMIT      # deploy a reviewed tag or commit, not a moving branch
corepack enable && corepack prepare pnpm@9.15.4 --activate
pnpm install --frozen-lockfile
pnpm build                                    # compiles every workspace package and the console
pnpm browser-sdk:build                        # script-tag bundles for a website (optional)
```

- **Backend:** Wrangler bundles the Worker from source when you deploy, so there is nothing to
  publish by hand. Run `pnpm build` first, because the Worker imports the compiled workspace
  packages.
- **Console:** `pnpm ops console` runs it from the checkout. Nothing is installed system-wide.
- **Website:** `pnpm browser-sdk:build` writes `packages/browser-sdk/dist/vizoalica.js` and
  `vizoalica-loader.js`, standalone bundles your site hosts itself.

To check a checkout, run `pnpm validate` (type check and all tests), plus `pnpm lint` and
`pnpm format:check`. `pnpm test:e2e` runs the Chromium responsive and accessibility scenarios and
`pnpm coverage` enforces the coverage gates.

Releases, pushes, tags, and builds never deploy your Worker: an operator deploys a chosen checkout
with the [backend guide](docs/operations/cloudflare.md). A Git-connected **website** may deploy
on its own push; the [website guide](docs/operations/pages.md) explains the difference.

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

Keeping it running: [update the backend](docs/operations/cloudflare.md#update-an-existing-backend),
[rotate a secret](docs/operations/cloudflare.md#recovery-and-removal), and
[delete a website's data](docs/operations/cloudflare.md#deleted-websites-and-projects). Deleting a
website or project is permanent; its data is removed by the daily cleanup.

## Privacy defaults

Vizoalica avoids collecting sensitive information by default:

- no raw form values;
- no passwords, payment data, API keys, cookies, or auth headers;
- no raw URL query values;
- no page text, DOM snapshots, heatmaps, or session replay;
- custom properties are filtered by name, type, count, and value length.

Client-side filtering is a convenience, not a trust boundary: the backend also rejects
sensitive-looking payloads before persistence. See [privacy operations](docs/operations/privacy.md).

No custom domain, paid Workers subscription, hosted dashboard, or always-on local process is
required for a small test. Review current Cloudflare pricing and configure retention and usage
alerts; included usage is not a guaranteed spending cap. See the
[cost model](docs/operations/cost-model.md).

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
| Console, default (private credential file)             | [Without OneCLI](docs/operations/local-analytics.md)                                           |
| Console, OneCLI-managed credential                     | [With OneCLI](docs/operations/ops-cli.md)                                                      |
| Daily console startup and mode check                   | [Start the console](docs/operations/operator-local.md)                                         |
| Register, deploy, verify, and remove a website         | [Website activation](docs/operations/pages.md)                                                 |
| Browser SDK reference                                  | [Browser SDK](docs/operations/browser-sdk.md)                                                  |
| What is collected and what is not                      | [Privacy](docs/operations/privacy.md)                                                          |
| D1 and R2 cost and capacity                            | [Cost model](docs/operations/cost-model.md)                                                    |
| Something failed                                       | [Troubleshooting](docs/operations/troubleshooting.md)                                          |
| Publishing a release, and making the repository public | [Releases](docs/operations/releases.md), [public checklist](docs/operations/public-release.md) |
| Vulnerability reports, contributing, brand             | [Security](SECURITY.md), [Contributing](CONTRIBUTING.md), [Brand](docs/brand.md)               |

Vizoalica is released under the [MIT License](LICENSE).
