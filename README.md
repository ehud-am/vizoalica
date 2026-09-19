<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/admin-web/public/brand/vizoalica-lockup-dark.svg">
    <img src="apps/admin-web/public/brand/vizoalica-lockup-light.svg" alt="Vizoalica" width="380">
  </picture>
</p>

<p align="center"><strong>Self-hosted, privacy-first web analytics that runs in your own Cloudflare account. One command sets it up; your visitors' data never leaves infrastructure you control.</strong></p>

<p align="center">
  <a href="https://github.com/ehud-am/vizoalica/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/ehud-am/vizoalica/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="package.json"><img alt="Version" src="https://img.shields.io/github/package-json/v/ehud-am/vizoalica"></a>
  <a href="https://vizoalica.dev"><img alt="Website" src="https://img.shields.io/badge/website-vizoalica.dev-168bff"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg"></a>
  <a href="https://nodejs.org"><img alt="Node.js" src="https://img.shields.io/badge/node-%3E%3D22-brightgreen"></a>
  <a href="https://workers.cloudflare.com"><img alt="Runs on Cloudflare" src="https://img.shields.io/badge/runs%20on-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white"></a>
</p>

Vizoalica collects page views from your websites, strips out anything sensitive before it is
stored, and gives you a local console to read the numbers: traffic over time, top pages,
referrers, browsers, devices, and unique visitors. You need a Cloudflare account, and a computer
with Node.js 22 or newer and Git.

## Try it

```sh
git clone https://github.com/ehud-am/vizoalica.git && cd vizoalica
corepack enable && pnpm install
pnpm ops install
```

`pnpm ops install` takes you from an empty Cloudflare account to a working console, and asks for
almost nothing. In a rehearsal on a real account (already signed in to Cloudflare) it took under
two minutes, most of it Cloudflare deploying and the numbers appearing:

1. It signs you in to Cloudflare (a browser window opens) and asks whether this is your first
   install. It detects the answer and offers it as the default.
2. It creates the database, storage bucket, and Worker, and deploys them. There is nothing to
   copy or edit.
3. It **generates your three secrets and shows them once**. You save them in a password manager
   and type `saved`; the screen is then cleared. It never asks you to invent or paste a key.
4. It sets up this computer as an operator console, and offers to send sample page views through
   your new backend so the console has something real to show.
5. It starts the console and opens it in your browser.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/console-overview-dark.png">
    <img src="docs/assets/console-overview-light.png" alt="The Vizoalica console showing 96 page views and 29 unique visitors from sample data" width="900">
  </picture>
  <br>
  <sub>The console after <code>pnpm ops install</code>, showing the sample data it sent through your own backend.</sub>
</p>

Delete the sample any time with `pnpm ops demo --remove`, then add your real website (below).
Windows is not supported yet: the console's private-file permission checks and the deploy scripts
assume macOS or Linux.

## The three parts, in order

A Vizoalica installation has three parts. Set them up in this order, because each one needs
something the previous one produces.

```text
  1. BACKEND ─────────────▶ 2. CONSOLE ─────────────▶ 3. WEBSITE
  Cloudflare Worker,        an admin's computer        your site: browser SDK
  database, storage         (Mac or Linux)             + a token endpoint

  produces: the Worker      needs: the Worker address  needs: a website registered in the
  address and 3 secrets            + the admin secret         console + the token secret
```

| Order | Part        | Runs on                                | What it does                                                                                              | Set up with                              |
| ----- | ----------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1     | **Backend** | Your Cloudflare account                | Receives signed event batches, filters them, and stores raw events (R2) and bounded aggregates (D1).      | `pnpm ops backend` (or `install`)        |
| 2     | **Console** | An operator's computer, only on demand | A local web app for projects, websites, and analytics. Its browser never holds a remote credential.       | `pnpm ops connect` (or `install`)        |
| 3     | **Website** | Wherever your site is hosted           | Loads the browser SDK and a small token endpoint that lets visitors' browsers send events to the backend. | The console's website panel (see step 3) |

Three secrets keep it safe, and none of them is ever in browser code:

| Secret                              | Held by                                                    | You need it to…                         |
| ----------------------------------- | ---------------------------------------------------------- | --------------------------------------- |
| `VIZOALICA_ADMIN_SECRET`            | The Worker and each operator's console                     | Connect another computer as a console   |
| `VIZOALICA_TOKEN_SECRET`            | The Worker and your website's token endpoint (server side) | Set up a website                        |
| `VIZOALICA_ANALYTICS_DIGEST_SECRET` | The Worker only                                            | Nothing day to day; keep it as a backup |

## Get started, part by part

`pnpm ops install` runs all three parts' first steps for you. Use the commands below to do one
part on its own, for example to add a second operator or to update the backend later.

### 1. Backend — first

```sh
pnpm ops backend
```

Asks **first install or update?** and does the right thing. A first install creates everything and
generates the secrets. An update deploys this checkout over your existing install and keeps your
data and secrets. It never adopts an existing database, and if a first install fails part-way it
offers to remove only the empty resources it just created.

Full guide: **[docs/operations/cloudflare.md](docs/operations/cloudflare.md)**.

### 2. Console — second

Run this on every computer that should administer Vizoalica. The first one is set up by
`pnpm ops install`; for any other, check out the repository, run `corepack enable && pnpm install`,
and then:

```sh
pnpm ops connect        # asks for the Worker address and the administrator secret (hidden)
pnpm ops console        # starts the console; open http://127.0.0.1:5173
```

`connect` checks the secret against your Worker before it writes anything, then saves it in a
private file (`0600`, outside the repository).

> **OneCLI is supported and is the more secure option.** With [OneCLI](https://onecli.sh) the
> administrator secret is held by a gateway and injected into requests to your Worker, so it is
> never written to a file on the operator's computer. It takes a few more setup steps and is not
> the default. `pnpm ops console` starts the console the same way in either mode.

Full guides: **[without OneCLI](docs/operations/local-analytics.md)** (the default) or
**[with OneCLI](docs/operations/ops-cli.md)**. Returning operators:
[Start the local operator console](docs/operations/operator-local.md).

### 3. Website — third

In the console, open **Projects**, choose or create a project, then **Websites → Add website**
(every website starts with an empty, required project choice) and enter its exact production
origin. Its integration panel gives you everything to paste:

1. For a site in its own GitHub repository: the generated GitHub Actions workflow and the
   repository variables and secrets it needs. Add them and push; the workflow deploys the site to
   Cloudflare Pages together with Vizoalica's loader and its configuration and token endpoints.
   The token endpoint needs `VIZOALICA_TOKEN_SECRET`, the secret you saved during step 1.
2. Open the site, grant analytics consent, and watch the page view appear in the console.

The panel offers two install options: a **Static snippet** that embeds six public values in the
page, or **Dynamic configuration**, one generic loader plus a versioned public JSON document. This
public browser configuration is not a secret. Direct Upload and Git-connected Pages are the manual
alternatives.

Full guide: **[docs/operations/pages.md](docs/operations/pages.md)**; SDK reference:
[docs/operations/browser-sdk.md](docs/operations/browser-sdk.md).

If a step fails, see [troubleshooting](docs/operations/troubleshooting.md) and resume at that step.

## Keep it running

`pnpm ops` is the operator's single entry point. It never accepts a secret as an argument.

| Command                                       | What it does                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm ops install`                            | First-time setup, start to finish: backend, this computer, sample data, console. |
| `pnpm ops backend`                            | Install or update the Cloudflare backend.                                        |
| `pnpm ops connect`                            | Set up this computer as an operator console.                                     |
| `pnpm ops console`                            | Start the private local API and the web console (`run` is an alias).             |
| `pnpm ops demo`                               | Add sample data; `--remove` deletes it permanently.                              |
| `pnpm ops rotate <admin\|token\|digest\|all>` | Replace a secret, show the new value once, and update this computer.             |
| `pnpm ops purge-deleted`                      | Dry-run; add `--apply` to permanently remove deleted websites and projects.      |
| `pnpm ops status` / `verify`                  | Show the credential mode and access checks, or just verify authenticated access. |
| `pnpm ops setup` / `doctor`                   | OneCLI mode: save its non-secret settings, and check its prerequisites.          |
| `pnpm ops deploy-pages`                       | Upload a Pages site with native Wrangler, then verify it.                        |
| `pnpm ops help` / `pnpm ops show`             | List the commands, or where each parameter comes from.                           |

Rotating a secret explains what it will break before it changes anything: the admin secret cuts
off every other console, the token secret rejects every website's events until updated, and the
digest secret restarts unique-visitor counts. Deleting a website or project is permanent; its
data is removed by the daily cleanup. Details:
[backend guide](docs/operations/cloudflare.md#update-an-existing-backend).

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

`pnpm ops install` and `pnpm ops backend` run `pnpm build` for you.

- **Backend:** Wrangler bundles the Worker from source when you deploy, so there is nothing to
  publish by hand.
- **Console:** `pnpm ops console` runs it from the checkout. Nothing is installed system-wide.
- **Website:** `pnpm browser-sdk:build` writes `packages/browser-sdk/dist/vizoalica.js` and
  `vizoalica-loader.js`, standalone bundles your site hosts itself.

To check a checkout, run `pnpm validate` (type check and all tests), plus `pnpm lint` and
`pnpm format:check`. `pnpm test:e2e` runs the Chromium responsive and accessibility scenarios and
`pnpm coverage` enforces the coverage gates. Prefer the manual, step-by-step install, for example
under an approval process? It is documented in full in the
[backend guide](docs/operations/cloudflare.md#manual-install).

Releases, pushes, tags, and builds never deploy your Worker: an operator deploys a chosen checkout
with the [backend guide](docs/operations/cloudflare.md). A Git-connected **website** may deploy on
its own push; the [website guide](docs/operations/pages.md) explains the difference.

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
| Deploy, update, rotate, and maintain the backend       | [Cloudflare backend](docs/operations/cloudflare.md)                                            |
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
