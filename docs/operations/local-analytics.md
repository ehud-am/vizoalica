# Set up an operator machine without OneCLI

Run this guide **once per operator or data analyst** who will store the Vizoalica administrator
credential in a private local file. Use [the OneCLI setup](ops-cli.md) instead when OneCLI manages
the credential. Do not complete both paths on the same machine.

## Prerequisites

- A completed [Cloudflare backend deployment](cloudflare.md) and its backend handoff.
- Node.js 22 or newer, Corepack, Git, and a current browser.
- The exact Vizoalica release or commit recorded in the backend handoff.
- Permission to obtain and store the administrator credential on this machine.

## Inputs

From the backend handoff, obtain the Worker HTTPS origin, release/commit, customer label, and
`VIZOALICA_ADMIN_SECRET`. Only the secret is sensitive. A project or website ID is not required;
an empty project list is normal on a fresh backend.

## Security boundary

The browser talks only to the loopback API. The API holds the credential and calls the Worker.
Keep the configuration outside the repository with owner-only permissions. Never put the secret
in browser configuration, a command argument, source control, logs, or support messages. Never
expose either local process to the network.

## 1. Prepare the reviewed checkout

```sh
git clone https://github.com/ehud-am/vizoalica.git
cd vizoalica
git checkout YOUR_APPROVED_TAG_OR_COMMIT
git rev-parse HEAD
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install --frozen-lockfile
mkdir -p "$HOME/.config/vizoalica"
chmod 700 "$HOME/.config/vizoalica"
```

Confirm that `git rev-parse HEAD` matches the backend handoff.

## 2. Create the private configuration

Read the secret without displaying it or saving it in shell history:

```sh
read -r -s VIZOALICA_ADMIN_SECRET
pnpm --filter @vizoalica/local-ops-api dev configure \
  "$HOME/.config/vizoalica/local-operations.json" \
  "https://YOUR_WORKER.YOUR_ACCOUNT_SUBDOMAIN.workers.dev" \
  "$VIZOALICA_ADMIN_SECRET"
unset VIZOALICA_ADMIN_SECRET
```

Use the exact Worker origin, with no path or trailing slash. The command creates a mode `0600`
file and refuses to overwrite an existing configuration. Do not print the file.

## 3. Start the console

In the first terminal:

```sh
pnpm local-ops-api:dev serve "$HOME/.config/vizoalica/local-operations.json"
```

In a second terminal:

```sh
pnpm admin-web:dev
```

Open the printed `http://127.0.0.1:<port>` URL. Use that exact origin; `localhost` and
`127.0.0.1` are different browser origins.

## Verify the operator setup

1. Open **Websites**. The project list must load; an empty list is success.
2. If a project exists, open **Overview** and load the `24h` range.
3. Confirm browser requests go to the loopback API, not directly to the Worker.
4. Confirm the administrator credential appears nowhere in the browser, output, or logs.

If verification fails, check the Worker origin, file ownership and mode, credential freshness,
browser origin, and release commit—in that order. Do not weaken origin checks or network binding.

## Operator handoff

Record only:

```text
Credential method: Private local file
Operator/machine: <redacted label>
Customer/environment: <label>
Release commit: <exact commit>
Worker origin: https://<worker>.<account-subdomain>.workers.dev
Configuration path: <private local path, no contents>
Loopback origin: http://127.0.0.1:<port>
Project listing verified at: <timestamp>
```

The operator can now [activate a website](pages.md). Never include the credential in the handoff.

## Stop or remove access

Press Ctrl+C in both terminals. To remove access, stop both processes, move only
`~/.config/vizoalica/local-operations.json` to the operating system's trash, and clear browser
data for the loopback origin if policy requires it. If exposure is possible, the customer owner
must rotate `VIZOALICA_ADMIN_SECRET` and update every remaining operator.

Removing this file does not affect the backend, analytics data, websites, or other operators.
