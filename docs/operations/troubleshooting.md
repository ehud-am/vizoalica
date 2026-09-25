# Deployment troubleshooting

Stop at the failed check and fix that step. Do not switch setup paths, expose secrets, weaken
origin checks, or alter an existing database. The install commands support fresh deployments
only; updating a running backend is a separate procedure (see below).

| Symptom                                                             | Check                                                                                       | Safe recovery                                                                                                                                                                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vizoalica deploy` stops at "check access"                          | The token cannot list your accounts or lacks a permission                                   | Give it Workers Scripts: Edit, D1: Edit, Workers R2 Storage: Edit, and Account Settings: Read. Rerun with `--verbose` to see the Cloudflare reply; nothing was created.                                                            |
| You did not save `VIZOALICA_TOKEN_SECRET` (or lost it)              | It is shown once, at the end of the deploy, and stored nowhere else                         | `vizoalica rotate NAME token` makes a new one and shows it. Websites already installed need the new value too.                                                                                                                     |
| `vizoalica rotate` asks for the account ID                          | The token cannot list accounts (that needs Account Settings: Read, which rotating does not) | Type the account ID: the 32-character code after `dash.cloudflare.com/` in the dashboard. It is remembered, or give it with `--account`.                                                                                           |
| `vizoalica rotate` says Cloudflare refused the change (403)         | The token lacks Workers Scripts: Edit, or the Worker is in another account                  | Use a token with Workers Scripts: Edit on that account (a Pages-only website token will not do). Find the Worker under Workers & Pages and use that account's ID with `--account`. Nothing was rotated.                            |
| A `vizoalica env add` question is garbled or missing                | An old version of the command                                                               | Update with `npm update -g vizoalica`. Each question is explained above its prompt; `--verbose` shows which one is being asked.                                                                                                    |
| Wrangler says login is required                                     | The saved OAuth login is absent or unusable                                                 | Run `pnpm exec wrangler login` in an interactive terminal, finish browser authorization, then repeat `pnpm exec wrangler whoami`.                                                                                                  |
| R2 creation is rejected                                             | R2 is not active for the account                                                            | Activate R2, then retry.                                                                                                                                                                                                           |
| D1 or R2 is not found                                               | Account, resource name, or D1 ID differs                                                    | Compare the live resources with the private configuration. Do not create duplicates blindly.                                                                                                                                       |
| Preflight reports a missing secret                                  | One of the three Worker secrets is absent                                                   | Complete the backend secret setup, then rerun preflight.                                                                                                                                                                           |
| `pnpm vizoalica backend` says a database or bucket "already exists" | This is not a first install: the names are taken                                            | Answer "update" to deploy over it, or pass `--database`, `--bucket`, and `--worker-name` to install alongside it. It never adopts existing data.                                                                                   |
| `pnpm vizoalica backend` says R2 is not enabled                     | R2 is not activated for the account                                                         | Activate R2 in the Cloudflare dashboard (billing details may be requested), then rerun. Nothing was left behind.                                                                                                                   |
| A first install stopped after the Worker was created                | An interrupted install; some secrets may be missing                                         | Run `pnpm vizoalica backend`, answer "update": it generates only the secrets that are missing and shows them.                                                                                                                      |
| `pnpm vizoalica connect` says the Worker rejected the secret        | The value is not the current `VIZOALICA_ADMIN_SECRET`                                       | Use the administrator secret you saved, not the token or digest one. If it was rotated, use the newest saved value.                                                                                                                |
| `pnpm vizoalica demo` says the token secret does not match          | The value is not the current `VIZOALICA_TOKEN_SECRET`                                       | Use the token secret you saved. `pnpm vizoalica demo --remove` deletes any partial sample first.                                                                                                                                   |
| Preflight or apply reports an existing schema                       | The D1 target is not fresh: `deploy:check` and `deploy:apply` are first-install commands    | For a first install, select a new empty D1 database. To update a running backend, use [Update an existing backend](cloudflare.md#update-an-existing-backend). Never repair or delete the existing database.                        |
| `pnpm vizoalica purge-deleted` fails with HTTP 404                  | The deployed Worker predates the purge endpoint                                             | [Update the backend](cloudflare.md#update-an-existing-backend), then rerun the dry run.                                                                                                                                            |
| Console returns 403                                                 | Browser origin is missing or differs                                                        | Use the exact printed loopback URL. Do not disable provenance checks.                                                                                                                                                              |
| Console Worker call returns 401                                     | The environment's secret was rejected, or it was rotated                                    | Run `vizoalica env check`. It says whether the Worker rejected the secret, the role does not match, or OneCLI could not supply it. Then `vizoalica env update NAME` with the current secret, or correct the OneCLI card and grant. |
| OneCLI gateway cannot resolve                                       | A container-only address was configured                                                     | Rerun `pnpm vizoalica setup` with the host-reachable gateway, normally `127.0.0.1:10255`, then run `pnpm vizoalica doctor`.                                                                                                        |
| Pages upload fails with `8000013`                                   | A proxy may have replaced Wrangler's upload token                                           | Use the native Cloudflare Pages path below. Do not add unrelated permissions.                                                                                                                                                      |
| Deployment times out                                                | Remote state is unknown                                                                     | Inspect D1 migration state and Worker deployment history before retrying.                                                                                                                                                          |
| SDK URL returns HTML                                                | The bundle was not copied to the deployed output                                            | Run `pnpm browser-sdk:build`, copy `vizoalica.js`, and redeploy.                                                                                                                                                                   |
| Loader URL returns HTML                                             | The dynamic loader was not copied to the deployed output                                    | Build and copy `vizoalica-loader.js`, then redeploy without enabling the static path too.                                                                                                                                          |
| Config URL returns 503                                              | One or more public variables are missing or invalid                                         | Review all six public values, exact project/source scope, HTTPS endpoints, and same-origin token URL; then redeploy.                                                                                                               |
| Config URL returns fallback HTML                                    | The Function or `_routes.json` merge was not deployed                                       | Keep `config.json.ts` beside the token Function, merge the config route, and deploy from the real site root.                                                                                                                       |
| Analytics initializes twice                                         | Static and dynamic paths are both enabled                                                   | Remove one path, redeploy, and verify a single loader/SDK element before resuming collection.                                                                                                                                      |
| Token URL returns HTML                                              | The Function was not discovered                                                             | Deploy from the site root with `--cwd`; keep `functions/` beside, not inside, `public/`.                                                                                                                                           |
| Ingest returns 401 `invalid_signature`                              | The website's token secret is not the Worker's                                              | Set the website's `VIZOALICA_TOKEN_SECRET` (GitHub secret, or its Pages secret) to the Worker's value and redeploy the website. Do not have it? `vizoalica rotate NAME token`, then update every website.                          |
| Ingest returns 401 `missing_token` or `malformed_token`             | The request carried no valid signed token; it is rejected before any lookup                 | Confirm the website's token endpoint works and its `VIZOALICA_TOKEN_SECRET` matches the Worker's. An unknown source key with no token also reports 401.                                                                            |
| Ingest returns 429 `rate_limited`                                   | The optional edge rate limiter throttled this client and source                             | Wait for `Retry-After`. If legitimate visitors share one address, raise `limit` in the `[[ratelimits]]` block and redeploy.                                                                                                        |
| Token Function returns 503                                          | Secret or server variables are missing                                                      | Set the production Pages secret and variables, then redeploy.                                                                                                                                                                      |
| Token Function returns 403                                          | Website origin or referrer differs                                                          | Use the registered production origin and a same-origin referrer.                                                                                                                                                                   |
| Worker rejects the token                                            | Signing secret or source scope differs                                                      | Match the Worker and issuer secret, project ID, source ID, and origin.                                                                                                                                                             |
| Push did not update the website                                     | The project uses Direct Upload or another production branch                                 | Inspect its deployment mode and commit; use Wrangler for Direct Upload.                                                                                                                                                            |
| Console counts remain zero                                          | The event was never accepted                                                                | Grant consent, confirm the Worker batch returns **202**, then refresh the same source's `24h` view.                                                                                                                                |

Dynamic configuration never falls back to another endpoint or identifier. A failed fetch,
malformed document, CSP block, or SDK load must leave the website usable and send no analytics;
repair the configuration rather than adding a default destination.

## Local console authorization recovery

The console never edits environments; every fix below is a `vizoalica env` command (see
[Environments](environments.md)).

- **Expired browser session:** select **Reconnect**. No credential repair or process restart is
  normally required.
- **The welcome page appears instead of the console:** it lists what is wrong with each environment. Run
  `vizoalica env list`, fix the one it names with `vizoalica env update NAME`, then choose **Check again**.
- **The Worker rejects the current secret:** `vizoalica env update NAME --secret-stdin` with the current
  value (or fix the OneCLI card and grant), then `vizoalica env check NAME`.
- **The role does not match:** the credential is a different kind than the environment says. Use the right
  credential, or change the role with `vizoalica env update NAME --role ROLE`.
- **OneCLI could not be used:** check `which onecli`, that its gateway is running, and the workspace, agent,
  and gateway saved for the environment.

- **`vizoalica console` says a console is probably running already:** something already listens on port 4318.
  Open `http://127.0.0.1:4318`, or stop the other console (Ctrl+C in its terminal) and run it again.
- **It says the environments file can be read by other users, or is damaged:** run the `chmod 600`
  command it prints, or fix the JSON by hand. Your data is not affected.
- **It says Node.js 22 or newer is needed:** install a current Node.js from nodejs.org and run it again.

## OneCLI and Pages uploads

Some OneCLI proxy configurations replace Wrangler's short-lived Pages upload authorization and
cause error `8000013`. Deploy Pages from a fresh terminal using native Cloudflare login, as
described in [website activation](pages.md). This does not change the OneCLI choice for the local
operator console. If policy forbids native Pages login, stop and have the OneCLI owner correct the
gateway; do not copy authorization headers or disable injection globally.

## Deleted data reappears or a purge seems stuck

Deleting a website or project is permanent: the daily run removes its data, or
`pnpm vizoalica purge-deleted --apply` does it immediately (dry run without `--apply`). A run is bounded
and reports `complete: false` internally until everything is gone; the command repeats itself up
to 100 times. If it still stops, rerun it; the purge resumes where it stopped and never touches
anything that is not soft-deleted. See [Deleted websites and projects](cloudflare.md#deleted-websites-and-projects).

## Interrupted backend deployment

A local timeout does not prove a remote operation failed. Inspect the D1 migration list and Worker
deployment history first. For the optional profile workflow, also run `deploy:status` for the plan
ID. Retry a mutation only after the target state is known; a recorded baseline intentionally
prevents a second fresh-schema apply.
