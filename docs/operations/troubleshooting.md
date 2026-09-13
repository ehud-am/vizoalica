# Deployment troubleshooting

Stop at the failed check and fix that step. Do not switch setup paths, expose secrets, weaken
origin checks, or alter an existing database. This release supports fresh deployments only.

| Symptom                              | Check                                                       | Safe recovery                                                                                                                                                                                                                                         |
| ------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrangler says login is required      | The saved OAuth login is absent or unusable                 | Run `pnpm exec wrangler login` in an interactive terminal, finish browser authorization, then repeat `pnpm exec wrangler whoami`.                                                                                                                     |
| R2 creation is rejected              | R2 is not active for the account                            | Activate R2, then retry.                                                                                                                                                                                                                              |
| D1 or R2 is not found                | Account, resource name, or D1 ID differs                    | Compare the live resources with the private configuration. Do not create duplicates blindly.                                                                                                                                                          |
| Preflight reports a missing secret   | One of the three Worker secrets is absent                   | Complete the backend secret setup, then rerun preflight.                                                                                                                                                                                              |
| Preflight reports an existing schema | The D1 target is not fresh                                  | Stop and select a new empty D1 database. Do not repair or delete the existing one.                                                                                                                                                                    |
| Console returns 403                  | Browser origin is missing or differs                        | Use the exact printed loopback URL. Do not disable provenance checks.                                                                                                                                                                                 |
| Console Worker call returns 401      | Configuration mode and startup command may not match        | Run `pnpm ops status`. Check whether the file is direct-secret or `onecli-managed`, then whether its corresponding startup command was used. Only then check hostname, secret freshness, `Authorization` / `Bearer {value}` format, and OneCLI grant. |
| OneCLI gateway cannot resolve        | A container-only address was configured                     | Rerun `pnpm ops setup` with the host-reachable gateway, normally `127.0.0.1:10255`, then run `pnpm ops doctor`.                                                                                                                                       |
| Pages upload fails with `8000013`    | A proxy may have replaced Wrangler's upload token           | Use the native Cloudflare Pages path below. Do not add unrelated permissions.                                                                                                                                                                         |
| Deployment times out                 | Remote state is unknown                                     | Inspect D1 migration state and Worker deployment history before retrying.                                                                                                                                                                             |
| SDK URL returns HTML                 | The bundle was not copied to the deployed output            | Run `pnpm browser-sdk:build`, copy `vizoalica.js`, and redeploy.                                                                                                                                                                                      |
| Loader URL returns HTML              | The dynamic loader was not copied to the deployed output    | Build and copy `vizoalica-loader.js`, then redeploy without enabling the static path too.                                                                                                                                                             |
| Config URL returns 503               | One or more public variables are missing or invalid         | Review all six public values, exact project/source scope, HTTPS endpoints, and same-origin token URL; then redeploy.                                                                                                                                  |
| Config URL returns fallback HTML     | The Function or `_routes.json` merge was not deployed       | Keep `config.json.ts` beside the token Function, merge the config route, and deploy from the real site root.                                                                                                                                          |
| Analytics initializes twice          | Static and dynamic paths are both enabled                   | Remove one path, redeploy, and verify a single loader/SDK element before resuming collection.                                                                                                                                                         |
| Token URL returns HTML               | The Function was not discovered                             | Deploy from the site root with `--cwd`; keep `functions/` beside, not inside, `public/`.                                                                                                                                                              |
| Token Function returns 503           | Secret or server variables are missing                      | Set the production Pages secret and variables, then redeploy.                                                                                                                                                                                         |
| Token Function returns 403           | Website origin or referrer differs                          | Use the registered production origin and a same-origin referrer.                                                                                                                                                                                      |
| Worker rejects the token             | Signing secret or source scope differs                      | Match the Worker and issuer secret, project ID, source ID, and origin.                                                                                                                                                                                |
| Push did not update the website      | The project uses Direct Upload or another production branch | Inspect its deployment mode and commit; use Wrangler for Direct Upload.                                                                                                                                                                               |
| Console counts remain zero           | The event was never accepted                                | Grant consent, confirm the Worker batch returns **202**, then refresh the same source's `24h` view.                                                                                                                                                   |

Dynamic configuration never falls back to another endpoint or identifier. A failed fetch,
malformed document, CSP block, or SDK load must leave the website usable and send no analytics;
repair the configuration rather than adding a default destination.

## Local console authorization recovery

Do not switch modes merely by changing the startup command. Switching between a private local
credential and OneCLI requires intentionally recreating the configuration with the corresponding
setup procedure.

- **Expired browser session:** select **Reconnect**. No credential repair or process restart is
  normally required.
- **`onecli-managed` launched directly:** stop it and run `pnpm ops run`. The direct API command is
  the wrong startup path and now refuses a detected placeholder.
- **Worker rejects the current credential:** use `pnpm ops status`, then repair or rotate the
  direct credential, or correct the OneCLI card and grant. Verify again before reopening the UI.

## OneCLI and Pages uploads

Some OneCLI proxy configurations replace Wrangler's short-lived Pages upload authorization and
cause error `8000013`. Deploy Pages from a fresh terminal using native Cloudflare login, as
described in [website activation](pages.md). This does not change the OneCLI choice for the local
operator console. If policy forbids native Pages login, stop and have the OneCLI owner correct the
gateway; do not copy authorization headers or disable injection globally.

## Interrupted backend deployment

A local timeout does not prove a remote operation failed. Inspect the D1 migration list and Worker
deployment history first. For the optional profile workflow, also run `deploy:status` for the plan
ID. Retry a mutation only after the target state is known; a recorded baseline intentionally
prevents a second fresh-schema apply.
