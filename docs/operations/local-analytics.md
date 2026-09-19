# Set up an operator machine without OneCLI

Run this guide **once per operator or data analyst** who will store the Vizoalica administrator
credential in a private local file. Use [the OneCLI setup](onecli.md) instead when OneCLI manages
the credential. Do not complete both paths on the same machine.

## Returning operator: start here

If this machine is already configured without OneCLI, run `pnpm vizoalica console` from your checkout
(see [Start the local operator console](operator-local.md)). Keep that terminal open and press
Ctrl+C once to stop. Run `pnpm vizoalica status` first whenever the configured mode is unclear. Do not
switch modes merely by changing the startup command.

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

**Fast path:** `pnpm vizoalica connect` does this step and verifies the secret before saving it. It asks
for the Worker address and the administrator secret (hidden), checks them against your Worker,
and writes the file with the right permissions. On the computer that ran `pnpm vizoalica install` this
is already done. The commands below are the manual equivalent.

Run the configuration command in an interactive terminal. It reads the administrator secret from
a hidden prompt; the secret is never a command argument:

```sh
pnpm --filter @vizoalica/local-ops-api dev configure \
  "$HOME/.config/vizoalica/local-operations.json" \
  "https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev"
```

Use the exact Worker origin, with no path or trailing slash. The command creates a mode `0600`
file and refuses to overwrite an existing configuration. To intentionally recreate a reviewed
direct-mode configuration, add `--replace`; inspect the target path first. Do not print the file.

## 3. Start the console

```sh
pnpm vizoalica console
```

This starts the loopback API with your private file and the web console together. Open
`http://127.0.0.1:5173`, or the URL Vite prints if that port was busy. Use that exact origin;
`localhost` and `127.0.0.1` are different browser origins. Keep the terminal open; press Ctrl+C
once to stop both processes.

The console’s interface and its trusted, credential-holding loopback API run only on this
computer. That does not mean analytics data is local: the selected backend and its D1/R2 storage
may be remote.

## Verify the operator setup

Before opening the browser, run the authenticated check:

```sh
pnpm vizoalica verify
pnpm vizoalica status
```

For this mode, `verify` reads the private file internally and confirms HTTP 200 with a JSON project
array without printing the credential. Then:

1. Open **Projects**, then **Websites**. The project list must load; an empty list is success.
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
Worker origin: https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev
Configuration path: <private local path, no contents>
Loopback origin: http://127.0.0.1:<port>
Project listing verified at: <timestamp>
```

The operator can now [activate a website](pages.md). Never include the credential in the handoff.

## Stop or remove access

Press Ctrl+C in the `pnpm vizoalica console` terminal. To remove access, stop it, move only
`~/.config/vizoalica/local-operations.json` to the operating system's trash, and clear browser
data for the loopback origin if policy requires it. If exposure is possible, the customer owner
must rotate `VIZOALICA_ADMIN_SECRET` and update every remaining operator.

Removing this file does not affect the backend, analytics data, websites, or other operators.
