# Guided operations CLI

`pnpm ops` is the shortest supported path for running the private analytics console and deploying
a Direct Upload Pages website. It stores only non-secret coordinates, explains where every value
comes from, checks the setup, and requires an exact project-name confirmation before a website
upload.

## Keep the three lanes separate

| Job                                     | Command                                            | Credential path                                                                     |
| --------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Deploy the ingestion Worker, D1, and R2 | `pnpm deploy:plan`, `deploy:check`, `deploy:apply` | Native Wrangler by default; an approval-gated OneCLI deployment profile is optional |
| Deploy a Direct Upload Pages website    | `pnpm ops deploy-pages`                            | Native Wrangler only; never wrap this command in `onecli run`                       |
| Run the private analytics console       | `pnpm ops run`                                     | OneCLI injects only the Worker administrator header                                 |

This separation matters. A Cloudflare deployment credential, the ingest signing secret, and the
Worker administrator secret have different powers and must not be combined.

## One-time setup

From the Vizoalica checkout:

```sh
pnpm install --frozen-lockfile
pnpm ops show
pnpm ops setup
```

In an interactive terminal, setup asks one question at a time. Press Enter to accept a displayed
default or skip an optional verification value. It creates two private files:

- `~/.config/vizoalica/ops.json` contains non-secret URLs, names, paths, and the gateway address.
- `~/.config/vizoalica/local-operations.json` contains the literal placeholder `onecli-managed`.

The command does not accept an option whose name looks like a secret, token, password,
authorization value, or API key. Put the real administrator secret only in OneCLI.
If a different client configuration already exists, setup preserves it and stops; review it before
using `--replace` intentionally.

### Where to find each answer

| Prompt               | Find it here                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| Worker HTTPS origin  | Cloudflare dashboard → Workers & Pages → ingestion Worker → workers.dev URL                        |
| OneCLI project slug  | OneCLI dashboard → project                                                                         |
| OneCLI console agent | OneCLI dashboard → a dedicated agent with only the Vizoalica administrator secret                  |
| Gateway              | The OneCLI gateway address reachable from the host; local self-hosted default is `127.0.0.1:10255` |
| Website folder       | Local directory containing the deployed assets and a sibling `functions/` directory                |
| Asset folder         | `public` for the included example; `.` when `index.html` is at the website root                    |
| Pages project        | Cloudflare dashboard → Workers & Pages → the exact project name                                    |
| Production branch    | Pages project settings, normally `main`                                                            |
| Production origin    | The stable `https://…pages.dev` URL, not a unique preview URL                                      |
| Analytics Project ID | Local console → website → Integration snippet                                                      |
| Internal Source ID   | Local console → website → Integration snippet; this is not the public source key                   |

For scripted setup, supply the same non-secret values as flags:

```sh
pnpm ops setup \
  --worker-url https://YOUR_WORKER.workers.dev \
  --project YOUR_ONECLI_PROJECT \
  --agent YOUR_CONSOLE_AGENT \
  --gateway 127.0.0.1:10255 \
  --site-dir /absolute/path/to/your-site \
  --pages-project YOUR_PAGES_PROJECT \
  --branch main \
  --assets-dir .
```

## Add the OneCLI card

Setup prints the exact non-secret host and agent. In the OneCLI dashboard, create a **Generic**
secret with:

| Field  | Value                                                                  |
| ------ | ---------------------------------------------------------------------- |
| Host   | The printed Worker hostname, without `https://`, a path, or a wildcard |
| Header | `Authorization`                                                        |
| Format | `Bearer {value}`                                                       |
| Value  | The raw `VIZOALICA_ADMIN_SECRET`, without the word `Bearer`            |

Attach it only to the dedicated console agent. Do not paste the value into the CLI or a support
message. OneCLI 2.11 command output may include agent access material, so do not share unredacted
agent-list output; rotate an agent token if it has been exposed.

## Check, then run

```sh
pnpm ops doctor
pnpm ops run
```

Doctor checks Node, OneCLI, the host-reachable gateway, the private client file, and the Worker's
health endpoint without reading or printing a secret. Run starts both the OneCLI-wrapped loopback
API and the web console in one terminal. Press Ctrl+C once to stop both.

The runner always passes the configured `--gateway` address. A Docker-only hostname such as
`gateway:10255` is rejected during setup, so no edit to OneCLI's `.env` file is needed for this
workflow.

## Deploy a Direct Upload website

First ask for the plan. It prints the asset directory, sibling Functions directory, Pages project,
branch, and authentication path, then stops without making changes:

```sh
pnpm ops deploy-pages
```

If the target is correct, repeat the command with the exact project name shown:

```sh
pnpm ops deploy-pages --confirm YOUR_PAGES_PROJECT
```

The command uses the repository's pinned Wrangler version, checks `wrangler whoami`, and uploads
the assets and sibling `functions/` directory with native Wrangler. When the production origin,
analytics Project ID, and internal Source ID were provided during setup, it also runs the website
verification. It never deploys Pages through OneCLI.

For a Git-connected Pages project, keep using its Git build instead; `deploy-pages` is for Direct
Upload projects. See the [complete Pages recipe](pages.md) for initial project creation, the shared
signing secret, SDK installation, and Git-versus-upload details.

## Worker, D1, and R2 deployment

The guided CLI intentionally does not hide infrastructure mutations. Continue to use the reviewed,
approval-gated workflow:

```sh
pnpm deploy:plan
pnpm deploy:check
pnpm deploy:apply
pnpm deploy:verify
```

The [Cloudflare installation guide](cloudflare.md) explains every resource and secret. Use its
optional OneCLI deployment profile only for Worker/D1/R2 operations, never for Pages uploads or
the local console agent.
