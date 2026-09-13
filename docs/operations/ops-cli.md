# Set up an operator machine with OneCLI

Run this guide **once per operator or data analyst** when OneCLI will inject the Vizoalica
administrator credential. Use [the direct setup](local-analytics.md) instead for private local
credential storage. Do not complete both paths on the same machine.

## Prerequisites

- A completed [Cloudflare backend deployment](cloudflare.md) and its backend handoff.
- Node.js 22 or newer, pnpm 9, Git, and a current browser.
- The exact Vizoalica release or commit recorded in the backend handoff.
- OneCLI 2.11 or newer, authenticated to the intended project.
- A dedicated operator agent, a reachable gateway, and authority to attach the Vizoalica
  administrator secret to that agent.

For a self-hosted gateway, use its host-reachable loopback address, normally
`127.0.0.1:10255`; a Docker-only hostname is not reachable from the operator machine.

## Inputs

Obtain the Worker HTTPS origin and release/commit from the backend handoff. Obtain the OneCLI project slug,
dedicated agent, and gateway address from OneCLI. Enter `VIZOALICA_ADMIN_SECRET` only in OneCLI's
protected interface. A project or website ID is not required.

## Security boundary

OneCLI injects the real credential only into HTTPS requests from the local API to the exact Worker
host. Vizoalica stores the literal placeholder `onecli-managed`, which is not a secret. The browser
talks only to the loopback API. If the gateway or grant is unavailable, access must **fail closed**;
never bypass OneCLI by copying the credential into local configuration.

## 1. Prepare the reviewed checkout

```sh
git clone https://github.com/ehud-am/vizoalica.git
cd vizoalica
git checkout YOUR_US1_COMMIT
git rev-parse HEAD
pnpm install --frozen-lockfile
pnpm ops show
```

Confirm that the commit matches the backend handoff and that OneCLI is authenticated to the
intended project.

## 2. Create the OneCLI credential card

In OneCLI, create a **Generic** secret and attach it only to the dedicated operator agent:

| Field  | Value                                                    |
| ------ | -------------------------------------------------------- |
| Name   | `Vizoalica administrator`                                |
| Host   | Exact Worker hostname, without scheme, path, or wildcard |
| Header | `Authorization`                                          |
| Format | `Bearer {value}`                                         |
| Value  | Raw `VIZOALICA_ADMIN_SECRET`, without the word `Bearer`  |

Restrict the agent to Vizoalica administrator and analytics routes where policy allows. Do not
attach Cloudflare deployment authority unless the operator separately owns deployment.

## 3. Configure and start

Run the guided setup and omit its optional website values:

```sh
pnpm ops setup
pnpm ops doctor
pnpm ops run
```

Setup creates private `~/.config/vizoalica/ops.json` coordinates and a
`~/.config/vizoalica/local-operations.json` file containing only `onecli-managed`. It refuses to
overwrite existing configuration without confirmation. Doctor checks the gateway and Worker
without printing credentials. Run starts both local processes.

Open the printed `http://127.0.0.1:<port>` URL. Do not expose either process to the network.

## Verify the operator setup

1. Open **Websites**. The project list must load; an empty list is success.
2. If a project exists, open **Overview** and load the `24h` range.
3. Confirm browser requests go only to the loopback API.
4. Confirm credentials and authorization headers appear nowhere in files, browser data, or output.
5. Temporarily stop the gateway or detach the grant; the request must fail closed.

If verification fails, check the gateway, Worker hostname, header format, secret card, agent
attachment, OneCLI authentication, and release commit—in that order. Do not disable certificate
validation or add a direct credential fallback.

## Operator handoff

Record only:

```text
Credential method: OneCLI
Operator/machine: <redacted label>
Customer/environment: <label>
Release/commit: <release and commit>
Worker origin: https://<worker>.workers.dev
OneCLI project/agent: <non-secret coordinates>
Gateway: <host-reachable address>
Loopback origin: http://127.0.0.1:<port>
Project listing and fail-closed behavior verified at: <timestamp>
```

The operator can now [activate a website](pages.md). Never include secret or agent access material.

## Revoke access

Stop `pnpm ops run`, detach or revoke the operator agent, and move only this machine's two
Vizoalica configuration files to the operating system's trash. Review OneCLI and Worker audit
evidence. If exposure is possible, the customer owner must rotate the administrator secret and
update every remaining operator.

Revocation does not affect the backend, analytics data, websites, or other operators. A future
session must be explicitly reauthorized; OneCLI setup never falls back to a local credential.
