# Installation troubleshooting

Start with the failing step, fix it, then repeat its check. The default supported path is
[Cloudflare-native deployment](cloudflare.md) plus an independently chosen
[OneCLI local console](local-analytics.md). Never share secret values or proxy environment dumps.

## Find the symptom

| Symptom                                                    | What to check                                              | Recovery                                                                                                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| R2 creation rejected                                       | R2 has not been activated for the account                  | Activate R2 in Cloudflare, then retry creation.                                                                                          |
| Membership permission cannot be found                      | Wrong permission label                                     | Choose `User → Memberships → Read`.                                                                                                      |
| Pages operation denied                                     | Missing Pages access                                       | Add `Account → Cloudflare Pages → Edit` to the intended account's deployment token.                                                      |
| D1/R2 not found                                            | Account, live names and database ID                        | List resources and compare both name and ID with the private production config; do not create duplicates blindly.                        |
| Preflight says secret missing                              | Both Worker secrets are required                           | Complete installation step 3 before deploy/check.                                                                                        |
| Console unavailable or missing table                       | Incomplete schema or older API process                     | Apply every pending migration through 0004 for 0.3.1, restart the API, check the console origin.                                         |
| Console GET returns 403                                    | Missing or foreign Origin/Referer                          | Use the printed loopback origin and current API; keep same-origin referrers. Do not disable provenance checks.                           |
| Console Worker call returns 401                            | Generic secret did not match or value differs              | Check exact Worker hostname, `Authorization`, `Bearer {value}`, raw secret and agent grant.                                              |
| `gateway` hostname cannot resolve                          | Docker address used from host                              | Use `onecli run --gateway 127.0.0.1:10255` with the actual published loopback port.                                                      |
| Wrangler demands `CLOUDFLARE_API_TOKEN` under OneCLI       | Older provider removed even the initialization placeholder | Upgrade to 0.3.1; it supplies only `onecli-managed` inside the wrapped Wrangler process. Never substitute a real token into the profile. |
| `Authorization failed [code: 8000013]` during Pages upload | Proxy may have replaced Wrangler's upload JWT              | Follow the explicit Pages/native path below; do not keep adding account permissions.                                                     |
| Deployment times out                                       | Remote operation can take longer than 30s                  | Use 0.3.1 operation budgets; inspect migrations/deployment history before retrying a mutation.                                           |
| SDK URL returns 200 but no events                          | Body may be fallback HTML                                  | Run `pnpm website:verify`; build/copy `vizoalica.js` to the website output, then redeploy.                                               |
| Token URL returns HTML                                     | Function was not compiled/discovered                       | Deploy from the site root with `--cwd`; keep `functions/` outside `public/`.                                                             |
| Token Function returns 503                                 | Missing secret or placeholder variables                    | Set the Pages secret and all public variables, then redeploy the production environment.                                                 |
| Token Function returns 403                                 | Wrong website/preview origin or missing referrer           | Use the configured production origin; check exact allowed origin and same-origin referrer policy.                                        |
| Worker rejects a token                                     | Signing values or source scope disagree                    | Match Worker/Pages signing secrets and token project ID, source ID, origin; public source key is a separate browser setting.             |
| Worker returns 429 after testing                           | Default source quota is only 100 events/day                | Stop repeated tests; wait for the quota window or deliberately adjust the policy and monitor costs.                                      |
| Push did not update website                                | Direct Upload or disabled Git builds                       | Check connected repository, branch and deployment commit; explicitly deploy with Wrangler for Direct Upload.                             |
| Only some pages track                                      | Integration missing from those pages/layout                | Inspect each deployed page, not an older sample commit; install the SDK consistently.                                                    |
| Console counts are zero                                    | Health passed but ingestion did not                        | Allow analytics, look for browser batch 202, then select the same project/source and refresh the 24h view.                               |

## OneCLI and Pages uploads

Observed during the reported deployment with **OneCLI 2.11.0 and Wrangler 4.127.1**: Wrangler
obtains a short-lived Pages upload JWT, then sends it to `/pages/assets/*` on `api.cloudflare.com`.
A host-wide authorization rewrite can replace that JWT with the account API token and cause
`8000013`. This is an external gateway integration limitation; a Vizoalica timeout or extra Pages
permission cannot correct the header replacement.

For the simple supported route, explicitly use native Cloudflare login in a fresh terminal outside
OneCLI for Pages deployment, as described in the [Pages recipe](pages.md). This is a deliberate
credential choice, not an automatic fallback. Keep using OneCLI for your local administrator client
if desired. If your policy requires all Cloudflare traffic through OneCLI, pause Pages deployment
until its gateway supports and verifies path-specific injection or preserves the upload JWT only
for the appropriate asset routes. Do not disable injection for all `api.cloudflare.com` traffic.

The demo operator reported a temporary transport workaround. This repository does not distribute
that bypass or claim to repair OneCLI itself. Share a redacted error code, tool versions and failing
path with OneCLI maintainers; do not share the upload JWT or authorization headers.

## Interrupted deployment

For the advanced profile flow, run `deploy:status` for the existing plan ID, check Cloudflare's
Worker deployment history and D1 pending migrations, then generate a fresh plan and preflight
receipt before retrying. A local timeout does not prove a remote operation failed. This release
allows 60 seconds for Wrangler reads, 120 seconds for dry runs and 300 seconds for migration/deploy
operations in both providers. The no-profile shell flow does not have that provider timeout.

## Coverage of the original 18 findings

| #   | Finding                          | Resolution in 0.3.1                                                                                                                             |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Membership label                 | Exact `User → Memberships → Read` in installation permissions.                                                                                  |
| 2   | Missing Pages permission         | Exact `Account → Cloudflare Pages → Edit`, separately scoped from Worker-only use.                                                              |
| 3   | Generic vault setup              | Exact dashboard field/value table in local console setup; no guessed CLI flags.                                                                 |
| 4   | Only first migration described   | All current files listed; no-pending-migrations checkpoint and upgrade rule.                                                                    |
| 5   | No deployable Pages issuer       | Included `examples/cloudflare-pages/functions/vizoalica/ingest-token.ts` plus secret/deploy recipe.                                             |
| 6   | No browser bundle/hosting path   | `pnpm browser-sdk:build` emits standalone IIFE; copy to website output.                                                                         |
| 7   | Wrong Wrangler working directory | Explicit site `--cwd`, directory diagram and Function-upload checkpoint.                                                                        |
| 8   | False-positive HTTP 200          | `pnpm website:verify` checks MIME, JavaScript and token claims; browser acceptance checked separately.                                          |
| 9   | Git versus upload unclear        | Mode table with branch/build/commit checks and commands for both.                                                                               |
| 10  | Hard-coded SDK placeholder       | Local API generates the SDK URL from the source's first website origin.                                                                         |
| 11  | Incomplete snippet               | Includes configured Worker endpoint, project, public key, token URL and consent; exposes source ID for issuer setup.                            |
| 12  | Same-origin GET rejected         | Retains Origin-first/Referer-fallback fix; negative tests for foreign, missing and malformed provenance.                                        |
| 13  | Sample integration removed       | Self-contained example in this repository; instructions to check every deployed page. External sample repository is not modified by this patch. |
| 14  | Docker gateway unreachable       | Verified OneCLI 2.11 `--gateway` override for local client; profile runner limitation explicitly stated.                                        |
| 15  | Wrangler token initialization    | Only wrapped Wrangler receives fixed non-secret `onecli-managed`; ambient secrets remain stripped.                                              |
| 16  | Pages temporary JWT replaced     | External limitation documented; explicit native Pages deployment supported, no unverified bypass.                                               |
| 17  | 30-second timeout                | Operation-specific 60/120/300-second Wrangler budgets with safe retry guidance.                                                                 |
| 18  | Stale resource configuration     | List live resources and compare account, names and D1 ID before migration.                                                                      |

Additional corrections: current seed SQL includes source name/timestamps, both Worker secrets are
set before preflight, source ID is distinguished from public key, and consent is explained as a
recorded state rather than a built-in collection gate.
