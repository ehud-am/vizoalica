# Local Analytics Operations

Vizoalica's analytics and website-management console runs only when an operator needs it. The
browser talks to a loopback API; that API is the only local component allowed to hold the remote
administrator credential or call the Worker. The browser never receives that credential, signing
keys, issued ingest tokens, visitor digests, raw events, or raw URL queries.

## Scope: this is the client machine only

This guide configures the operator's client machine that runs the local analytics console and its
loopback API. It does **not** change either of these existing procedures:

- Deploying the Worker, D1, R2, migrations, and Worker secrets remains in the
  [Cloudflare deployment guide](./cloudflare.md).
- Adding the JavaScript snippet and token endpoint to a website remains in the
  [browser SDK guide](./browser-sdk.md).

The client machine needs the deployed Worker's HTTPS URL and its `VIZOALICA_ADMIN_SECRET`. That
administrator secret is different from the Cloudflare API token used to deploy infrastructure.
Choose exactly one client credential path below:

| Client path    | Where the Worker administrator secret lives                             | How the loopback API is started |
| -------------- | ----------------------------------------------------------------------- | ------------------------------- |
| With OneCLI    | OneCLI's encrypted vault; the local file contains only `onecli-managed` | Wrapped with `onecli run`       |
| Without OneCLI | An operator-owned local file with mode `0600`                           | Started directly with pnpm      |

The client choice is independent of the Cloudflare deployment choice. For example, the Worker may
be deployed with Cloudflare-native authentication while the client uses OneCLI, or the reverse.

## Shared client prerequisites

Install Node.js 22 and pnpm 9 on the client machine, clone the same reviewed Vizoalica release, and
install its dependencies. Apply all D1 migrations through `0004_local_operations.sql` during the
unchanged Cloudflare deployment procedure before using the console.

```bash
pnpm install --frozen-lockfile
```

Create a private client configuration directory:

```bash
mkdir -p "$HOME/.config/vizoalica"
chmod 700 "$HOME/.config/vizoalica"
```

Do not expose the loopback API or development web server to the network. Both must remain bound to
`127.0.0.1`.

## Path A: client machine with OneCLI

Use this path when OneCLI should retain the Worker administrator secret and inject it only into
HTTPS requests from the local API to the deployed Worker.

1. Use your existing local vault, or first follow OneCLI's
   [Community self-hosting setup](https://onecli.sh/docs/self-hosting/community) and
   [client connection guide](https://onecli.sh/docs/self-hosting/connect-agents). A locally hosted
   vault requires its Docker services to be running. Install OneCLI 2.11 or newer and authenticate
   the client machine to the intended OneCLI project. Keep the API address and gateway address
   distinct; the gateway port is used for proxied Worker requests.
2. In the OneCLI dashboard, create a **Generic** secret with these exact fields:

   | Field               | Value                                                                                                |
   | ------------------- | ---------------------------------------------------------------------------------------------------- |
   | Name                | `Vizoalica administrator` (a label you choose)                                                       |
   | Host / host pattern | Exact Worker hostname, e.g. `vizoalica-ingest.example.workers.dev` — no `https://`, path or wildcard |
   | Header              | `Authorization`                                                                                      |
   | Value format        | `Bearer {value}`                                                                                     |
   | Secret value        | The raw `VIZOALICA_ADMIN_SECRET` stored on the Worker, **without** a `Bearer ` prefix                |

   Use the dashboard fields for OneCLI 2.11: its CLI help lists generic-secret creation but does
   not describe the header/value-format fields needed here. Do not guess flags or put the real
   value in a command. Save the secret before attaching it. See OneCLI's
   [gateway model](https://onecli.sh/docs/how-it-works) and
   [CLI reference](https://onecli.sh/docs/cli/onecli-cli).

3. Attach that secret to a dedicated client agent. Restrict the agent to the Worker's administrator
   and analytics routes; do not grant it the Cloudflare deployment connection unless this machine
   also performs deployments.
4. Create a local **placeholder** configuration. The literal value `onecli-managed` is not a real
   credential:

```bash
pnpm --filter @vizoalica/local-ops-api dev configure \
  "$HOME/.config/vizoalica/local-operations.json" \
  "https://your-worker.example" \
  "onecli-managed"
```

5. Start the loopback API through the OneCLI gateway:

```bash
onecli run --project <project-slug> --agent <client-agent-identifier> -- \
  pnpm local-ops-api:dev serve "$HOME/.config/vizoalica/local-operations.json"
```

OneCLI wraps the local API process with its HTTPS proxy and CA settings. The API sends the
placeholder bearer value, and the gateway replaces it at request time for the configured Worker
host. The real administrator secret is not written to the Vizoalica configuration or returned to
the browser. If OneCLI, its agent grant, or the matching secret is unavailable, Worker requests
must fail closed; do not restart the API directly as a fallback.

### Self-hosted gateway on macOS or Linux

If the local API cannot reach `gateway:10255`, that hostname belongs to Docker's network, not
necessarily your host. Ensure the gateway port is published on **loopback** (for example,
`127.0.0.1:10255:10255` in the gateway service's Compose ports), then use OneCLI's supported
host override:

```bash
onecli run --project <project-slug> --agent <client-agent-identifier> \
  --gateway 127.0.0.1:10255 -- \
  pnpm local-ops-api:dev serve "$HOME/.config/vizoalica/local-operations.json"
```

`--gateway` is present in OneCLI 2.11.0 `onecli help`. Use the actual published port if different.
For a remote gateway, use its reachable address according to your OneCLI installation. Keep
OneCLI's proxy authentication and CA settings intact; do not print the wrapped environment,
copy proxy credentials, disable TLS verification, or use `--no-ca` to hide a certificate problem.
See [OneCLI self-hosted client setup](https://onecli.sh/docs/self-hosting/connect-agents).

**Check:** start the console below and confirm the project list loads. If it fails, check the
exact Worker hostname, secret value format, attached grant and gateway address in that order.
An empty project list on a new installation is success; create the first project and website.

## Path B: client machine without OneCLI

Use this path when the operator will manage the Worker administrator secret directly on the client
machine. Capture it without placing the value in shell history, then write the private configuration:

```bash
read -r -s VIZOALICA_ADMIN_SECRET
pnpm --filter @vizoalica/local-ops-api dev configure \
  "$HOME/.config/vizoalica/local-operations.json" \
  "https://your-worker.example" \
  "$VIZOALICA_ADMIN_SECRET"
unset VIZOALICA_ADMIN_SECRET
```

The command writes the file atomically with mode `0600`. Never copy it into the repository, a
browser configuration file, a support message, or a shared analytics link. For environment-based
development, copy `apps/local-ops-api/.env.example` outside the repository and preserve the same
permissions.

Start the loopback API directly:

```bash
pnpm local-ops-api:dev serve "$HOME/.config/vizoalica/local-operations.json"
```

## Start the console for either path

After the loopback API is running using Path A or Path B, start the browser console in a second
terminal:

```bash
pnpm admin-web:dev
```

Open the loopback URL printed by the development server. The console proxies `/api` to the local
API; it never calls the Worker directly. The API prefers the exact `Origin` header, or the origin parsed from `Referer` when browsers
omit `Origin` on same-origin GETs. Foreign or missing provenance is rejected. It also requires a short-lived HttpOnly, SameSite session cookie. You do not run `pnpm worker:dev` on this client:
the local API connects to the already deployed Worker URL.

Keep the printed `http://127.0.0.1:5173` origin consistent with the configured console origin;
`localhost` and `127.0.0.1` are different origins. If port 5173 is busy, stop the old console before
restarting instead of silently using another port. A `Workspace unavailable` message can mean a
wrong origin, an older local API, missing migrations, or a failed remote credential; see
[troubleshooting](troubleshooting.md).

Verify that the console can list projects and websites and load a fixed analytics window. Then stop
or revoke the client credential once the operator session is complete.

## Website and analytics behavior

- Website creation accepts a display name and one to ten exact HTTP(S) origins.
- The generated source key is public. A customer website remains responsible for issuing
  short-lived ingest tokens from its own backend.
- Disable is reversible. Delete is a terminal soft deletion that stops collection while retaining
  historic aggregates and administrative audit evidence. A disabled website still appears in the
  website selector, labeled "(history only, disabled)" - you can review its historic analytics,
  but it is no longer collecting new events.

## Dashboard tour

Opening the console lands on **Overview**, the analytics dashboard. It always shows one coherent
result for one scope and one time range - there is never a mix of results from two different
requests on screen at once, and switching scope or range while a request is in flight cancels the
stale one rather than letting it overwrite a newer result.

- **Scope**: the Project selector picks which project's data you're looking at; the Website
  selector defaults to **All websites** (deduplicated project-wide totals) or narrows to one
  website's source-local totals. All websites is always the first option.
- **Time range**: the compact trigger in the top-right of the filters panel shows the active range
  in plain language (for example "Last 24 hours" or an exact local date/time span for a custom
  range). Opening it reveals five presets - Last 6 hours, Last 12 hours, Last 24 hours, Last 7
  days, Last 30 days - and a Custom option with From/To fields in your browser's local timezone
  (shown explicitly beside the fields). Nothing changes until you press Apply; dismissing the
  popover without applying (Escape or clicking away) keeps your draft edit for next time without
  issuing a request.
- **Totals**: page views and unique users for the selected scope and range, shown as explicit
  numbers - including an explicit `0`, never a blank tile - so an empty range reads as "nothing
  happened" rather than "the dashboard is broken."
- **Trend**: a page-view/unique-user line chart bucketed by hour (ranges of a day or less) or by
  day (longer ranges), paired with an exact-value table beneath it so the same numbers the chart
  draws are always available as text.
- **Rankings**: top-ten tables for pages, countries, user agents, and referrers, each with an
  explicit remainder row ("Other") summing everything past the top ten rather than silently
  dropping it.
- **Distributions**: operating system, browser, device, and human/bot/unknown breakdowns as a
  chart paired with an exact count/percentage list - the chart itself is decorative (screen
  readers skip it); the list carries the real information.
- **Availability**: if the selected range starts before this project's expanded analytics were
  available (for example, right after upgrading past migration `0005`), the dashboard says so
  explicitly and still shows whatever data is available, rather than presenting a silently
  incomplete result as if it were complete.

### Screenshots

This repository does not ship dashboard screenshots, since the dashboard has no meaningful data
until you have a deployed Worker receiving real traffic. After following the steps above with a
live deployment, capture your own from the browser once Overview shows real totals - that keeps
documentation screenshots accurate to your actual deployed version rather than a stale image
from this repository's history.

### Browser support

The console is a modern evergreen-browser single-page app (current Chrome, Firefox, Safari, or
Edge). It uses `<input type="datetime-local">` for the custom time range and CSS custom
properties for theming; both require a browser from the last few years. There is no
Internet Explorer or extended-support-browser target.

### Theme

Light/dark theme follows your operating system's preference by default. The Light/Dark control in
the top bar sets an explicit preference instead, which is saved to a local preferences file
(`preferences.json`, beside your `local-operations.json` configuration) and takes priority over
the system preference on every later console launch, on this machine, until changed again. If
that file can't be written (for example, a read-only home directory), the chosen theme still
applies for the current session - you'll see a small notice that it couldn't be saved.

### Identity and "Unknown" / "Other"

- **Identity mode**: the All-websites scope uses a project-wide reviewed pseudonym where your
  ingest tokens supply one (shared, non-reversible identity across that project's websites);
  otherwise it falls back to a source-local pseudonym, private to one website. A single-website
  scope always uses that website's source-local identity. The dashboard's totals description
  states which mode is in effect for the current scope.
- **Unknown**: any classified dimension (country, browser, operating system, device, traffic
  type) that could not be determined from the trusted request signals available at ingest time -
  for example, no `CF-IPCountry` header, or a missing/unparseable User-Agent - is labeled
  `Unknown` rather than guessed at or left blank.
- **Other**: the remainder past the top ten (rankings) or top eleven (distributions) explicit
  values for a dimension, always shown as one summed row/slice rather than silently dropped.

## Privacy guarantees

- Analytics is limited to rolling presets (`6h`/`12h`/`24h`/`7d`/`30d`) or a bounded custom range
  (minute-aligned, no more than 30 days, never later than the current complete minute). Every
  query reads indexed D1 aggregates; none fall back to scanning raw R2 batches.
- Unique-user presence uses a keyed, non-reversible HMAC digest computed server-side. Only
  aggregate counts and digests ever reach D1; raw IP addresses, full User-Agent strings, and any
  other raw request metadata never leave the Worker's classification step, and never reach
  CloudEvents, R2, logs, or the browser.
- Country, browser, operating system, device, and traffic classification is normalized to a fixed
  taxonomy (see Unknown/Other above) before storage - the raw signals that produced it are
  discarded immediately after classification.
- Processing, unavailable, denied, and interrupted outcomes are explicit. An unavailable response
  never presents cached totals as current; an interrupted maintenance operation advises a safe
  status check or retry.

## Credential lifecycle

### With OneCLI

Rotate the administrator secret in OneCLI without changing the placeholder configuration. Detach
or revoke the client agent's secret grant to stop new authenticated Worker requests, then restart
the wrapped local API after restoring access. If the machine is lost, revoke its OneCLI identity
and review OneCLI and Worker audit evidence.

### Without OneCLI

Rotate access by rerunning `configure` with the replacement credential captured through a hidden
prompt. Revoke local access with:

```bash
pnpm --filter @vizoalica/local-ops-api dev revoke \
  "$HOME/.config/vizoalica/local-operations.json"
```

For both paths, the Worker remains the final authority: a remotely revoked administrator secret
invalidates the current local browser session on its next request. Without OneCLI, reauthorize by
writing a valid replacement credential and restarting the local API. Losing a directly configured
machine requires rotating the corresponding credential at the Worker boundary.

## Operations, cost, and recovery

The console and loopback API cost nothing while stopped. The production data plane adds no service
beyond the existing Worker, D1, and R2 resources. Storage growth is bounded to hourly page-view
counters, hourly opaque visitor-presence rows, configuration, and audit records; normal analytics
does not read R2.

D1 configuration, aggregate, and audit tables should be included in the operator's normal D1
backup/export schedule. R2 raw batches follow the configured retention and lifecycle policy.
Recovery consists of restoring D1, verifying project/source isolation, and retaining R2 objects
whose retention has not elapsed. Configuration and aggregates use ordinary SQLite-compatible
tables and JSON/CSV-capable exports, providing a migration path to another backend adapter without
changing browser instrumentation or accepted event history.

To tear down local operation, stop both local processes and remove the operator-owned configuration
file. For OneCLI, also detach or revoke the client agent. This does not remove remote data. Remote
teardown follows the Cloudflare operations guide and must export required data before deleting D1,
R2, or the Worker.

## Deferred MCP adapter boundary

The AI-tool client is deliberately deferred. Its future adapter may expose project listing,
website lifecycle, safe snippets, status, fixed-window analytics, and approved maintenance actions,
but it **must call this loopback API**. It must not call the Worker, D1, R2, or Cloudflare APIs
directly, own another administrator credential, or reproduce authorization and business rules.
Compatibility tests must prove that web and MCP clients receive the same project scope,
authorization result, completeness state, and audited mutation outcome.
