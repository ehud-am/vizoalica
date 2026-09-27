# Troubleshooting

Start with `list_environments` and `get_environment_status`, or have the user run
`vizoalica env check` (add `--verbose` to any command; it never prints secrets).

| Symptom                                               | Likely cause                                                              | What the user does                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| An environment "does not work": secret rejected       | Secret rotated or access key revoked                                      | `vizoalica env update <name>` with the current secret, or ask the admin for a new key                                    |
| Role mismatch                                         | The environment says `admin` but the credential is a key (or the reverse) | `vizoalica env update <name>` with the right role                                                                        |
| Worker unreachable                                    | Wrong address or network                                                  | `vizoalica env check <name>`; fix the address with `env update`                                                          |
| Worker or schema older than this package              | Backend not updated                                                       | Update the backend from a checkout: `pnpm vizoalica backend --update --env <name>`                                       |
| Worker newer than this package                        | Old command                                                               | `npm update -g vizoalica`                                                                                                |
| Website status `sdk-file-missing`                     | `/vizoalica.js` (or loader) not deployed with the site                    | Redeploy the site with the SDK file                                                                                      |
| `token-endpoint-missing` / `token-endpoint-rejecting` | Token Function not deployed, or its secret/variables missing              | Deploy the Function; set `VIZOALICA_TOKEN_SECRET` on the site                                                            |
| `origin-not-allowed`                                  | The site's address (for example `www.`) is not in the allowed origins     | Add the address to the website in the console and to the endpoint's list                                                 |
| `site-redirects`                                      | Every allowed address redirects elsewhere                                 | List the address that actually serves the site                                                                           |
| `config-file-missing`                                 | GitHub path: `/vizoalica/config.json` not published                       | Check the latest run in the repository's Actions tab                                                                     |
| Ingest 401 `invalid_signature`                        | Site's token secret differs from the Worker's                             | Set the site's `VIZOALICA_TOKEN_SECRET` to the Worker's; lost it: `vizoalica rotate <name> token` then update every site |
| Counts stay zero, install `ok`                        | No consented visit yet, or data still processing                          | Visit the site, grant consent, wait a minute, check `last_24_hours`                                                      |
| `vizoalica deploy` stops at "check access"            | Token lacks a permission                                                  | Token needs Workers Scripts: Edit, D1: Edit, Workers R2 Storage: Edit, Account Settings: Read                            |

Full table: https://vizoalica.dev (Troubleshooting) or `docs/operations/troubleshooting.md`.
