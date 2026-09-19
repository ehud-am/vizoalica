# Set up an operator machine with OneCLI

Run this guide **once per operator**. Use [direct setup](local-analytics.md) instead when OneCLI
will not manage the administrator credential. Do not combine the two methods.

## Returning operator: start here

If this machine is already configured with OneCLI, use the one-terminal commands in
[Start the local operator console](operator-local.md): run `pnpm vizoalica verify`, then
`pnpm vizoalica console`. Keep that terminal open and press Ctrl+C once to stop both processes. Never
start `pnpm local-ops-api:dev` directly when the file contains `onecli-managed`, and do not switch
modes merely by changing the startup command.

## Prerequisites

- A completed [backend deployment](cloudflare.md) and its verified handoff.
- Node.js 22 or newer, Corepack, Git, and a current browser.
- OneCLI 2.11 or newer and authority to manage one dedicated operator agent.

For a self-hosted gateway, use its host-reachable address, normally `127.0.0.1:10255`; a
Docker-only hostname will not work from the operator machine.

## Inputs

From the backend handoff, obtain the customer/environment, exact release commit, Worker script
name, complete Worker origin, account label and abbreviated ID, deployment/version ID,
administrator password-manager record name, and verification timestamp. From OneCLI, obtain the
project slug, dedicated agent identifier and ID, and gateway address. A project or website ID is
not required.

## Security boundary

OneCLI injects the real credential only into HTTPS requests to the exact Worker host. Vizoalica
stores only the literal placeholder `onecli-managed`. The browser talks only to the loopback API.
Missing OneCLI access must fail closed; never copy the credential into local configuration.

> **Important:** If `local-operations.json` contains `onecli-managed`, the API must be launched
> with `pnpm vizoalica console`. Starting `pnpm local-ops-api:dev` directly sends the placeholder and results
> in HTTP 401. The API refuses this direct launch when it can identify the placeholder.

## 1. Verify the handoff and checkout

Check the supplied origin before changing OneCLI:

```sh
curl --fail --silent --show-error https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev/healthz
```

Stop if it does not return JSON containing `"ok":true`. Reconcile the Worker name, complete
origin, account, deployment/version, and commit with the backend owner; do not guess a replacement
host.

```sh
git clone https://github.com/ehud-am/vizoalica.git
cd vizoalica
git checkout YOUR_APPROVED_TAG_OR_COMMIT
git rev-parse HEAD
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install --frozen-lockfile
pnpm vizoalica show
```

The printed commit must exactly match the handoff.

## 2. Inspect the OneCLI agent

Use the agent ID from OneCLI; do not infer it from the display name.

```sh
onecli auth status
onecli agents grants list --id <agent-id> --project <project-slug>
onecli agents credentials --id <agent-id> --project <project-slug>
```

Confirm the intended project and agent. Before adding the administrator card, the agent must have
no Cloudflare deployment connection and no unrelated secret or grant. Do not run
`onecli agents list --with-grants`: it may print agent access material. Treat such output as an
exposure and rotate the affected agent token.

## 3. Create or replace the credential card

In OneCLI, create a **Generic** secret and attach it only to the dedicated operator agent:

| Field  | Value                                                                     |
| ------ | ------------------------------------------------------------------------- |
| Name   | `Vizoalica administrator — <customer/environment> — <Worker script name>` |
| Host   | Exact Worker hostname, without scheme, path, or wildcard                  |
| Header | `Authorization`                                                           |
| Format | `Bearer {value}`                                                          |
| Value  | Raw `VIZOALICA_ADMIN_SECRET`, without `Bearer`                            |

Use the administrator password-manager record named in the same backend handoff. Never retarget
only the host of an existing card: confirm or replace both its host and value together. Restrict
the card to Vizoalica administrator and analytics routes where policy allows.

Repeat the two agent inspection commands from step 2. Confirm the agent has exactly this
environment's administrator card, no Cloudflare deployment connection, and no unrelated secret.

## 4. Configure, check, and verify

```sh
pnpm vizoalica setup
pnpm vizoalica doctor
pnpm vizoalica verify
pnpm vizoalica status
```

Setup writes private coordinates and the non-secret placeholder. If the existing client
configuration points elsewhere, setup refuses to replace it; inspect the target and rerun with
`--replace` only when intentional.
Doctor checks public health and local prerequisites—it does **not** authenticate. Verify must report
HTTP 200, a JSON array, and the selected OneCLI agent without printing a credential.

Then start the local console:

```sh
pnpm vizoalica console
```

Open `http://127.0.0.1:5173`, or the URL Vite prints if that port was busy. Do not expose either
process to the network.

The **Local workspace** disclosure describes the local console and trusted loopback service that
holds the injected credential. The selected analytics backend and stored data can still be remote.

## Verify the operator setup

Complete this positive–negative–positive test with the same `pnpm vizoalica verify` request:

1. With the grant attached, verify succeeds.
2. Detach the administrator grant from the operator agent.
3. Verify fails.
4. Restore the same grant.
5. Verify succeeds again.

Then open **Projects** followed by **Websites**; the project list must load, and an empty array is success. If a project
exists, open **Overview** and load `24h`. In browser developer tools, confirm requests go only to
loopback and no authorization header or credential appears in browser-visible storage.

On failure, check the handoff identity, card host and value, agent ID and grant, OneCLI project and
authentication, gateway, and commit. Do not disable certificate validation or add a direct-secret
fallback.

## Operator handoff

Record no secret or agent access material:

```text
Credential method: OneCLI
Operator/machine: <redacted label>
Customer/environment: <label>
Release commit: <exact commit>
Worker script/origin: <script name> / https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev
Cloudflare account: <label and safely abbreviated ID>
Deployment/version ID: <identifier>
Administrator record: <password-manager record name, not value>
OneCLI project/agent: <non-secret coordinates>
Gateway/loopback: <host-reachable address> / http://127.0.0.1:<port>
Backend verified at: <timestamp>
Authenticated and fail-closed verification completed at: <timestamp>
```

The operator can now [activate a website](pages.md).

## Revoke access

Stop `pnpm vizoalica console`, detach or revoke the operator agent, and move only this machine's two
Vizoalica configuration files to the operating system's trash. Review OneCLI and Worker audit
evidence. If exposure is possible, rotate the administrator secret and update every remaining
operator. Revocation does not affect the backend, analytics data, websites, or other operators.
