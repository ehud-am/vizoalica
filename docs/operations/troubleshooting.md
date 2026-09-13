# Deployment troubleshooting

Stop at the failed check and fix that step. Do not switch setup paths, expose secrets, weaken
origin checks, or alter an existing database. This release supports fresh deployments only.

| Symptom                              | Check                                                       | Safe recovery                                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Wrangler says login is required      | The saved OAuth login is absent or unusable                 | Run `pnpm exec wrangler login` in an interactive terminal, finish browser authorization, then repeat `pnpm exec wrangler whoami`. |
| R2 creation is rejected              | R2 is not active for the account                            | Activate R2, then retry.                                                                                                          |
| D1 or R2 is not found                | Account, resource name, or D1 ID differs                    | Compare the live resources with the private configuration. Do not create duplicates blindly.                                      |
| Preflight reports a missing secret   | One of the three Worker secrets is absent                   | Complete the backend secret setup, then rerun preflight.                                                                          |
| Preflight reports an existing schema | The D1 target is not fresh                                  | Stop and select a new empty D1 database. Do not repair or delete the existing one.                                                |
| Console returns 403                  | Browser origin is missing or differs                        | Use the exact printed loopback URL. Do not disable provenance checks.                                                             |
| Console Worker call returns 401      | Host, header format, secret, or OneCLI grant differs        | Check the exact host, `Authorization`, `Bearer {value}`, raw secret, and agent grant.                                             |
| OneCLI gateway cannot resolve        | A container-only address was configured                     | Rerun `pnpm ops setup` with the host-reachable gateway, normally `127.0.0.1:10255`, then run `pnpm ops doctor`.                   |
| Pages upload fails with `8000013`    | A proxy may have replaced Wrangler's upload token           | Use the native Cloudflare Pages path below. Do not add unrelated permissions.                                                     |
| Deployment times out                 | Remote state is unknown                                     | Inspect D1 migration state and Worker deployment history before retrying.                                                         |
| SDK URL returns HTML                 | The bundle was not copied to the deployed output            | Run `pnpm browser-sdk:build`, copy `vizoalica.js`, and redeploy.                                                                  |
| Token URL returns HTML               | The Function was not discovered                             | Deploy from the site root with `--cwd`; keep `functions/` beside, not inside, `public/`.                                          |
| Token Function returns 503           | Secret or server variables are missing                      | Set the production Pages secret and variables, then redeploy.                                                                     |
| Token Function returns 403           | Website origin or referrer differs                          | Use the registered production origin and a same-origin referrer.                                                                  |
| Worker rejects the token             | Signing secret or source scope differs                      | Match the Worker and issuer secret, project ID, source ID, and origin.                                                            |
| Push did not update the website      | The project uses Direct Upload or another production branch | Inspect its deployment mode and commit; use Wrangler for Direct Upload.                                                           |
| Console counts remain zero           | The event was never accepted                                | Grant consent, confirm the Worker batch returns **202**, then refresh the same source's `24h` view.                               |

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
