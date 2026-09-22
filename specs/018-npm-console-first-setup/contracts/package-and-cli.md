# Contract: The npm package and the `vizoalica` command

## The package

- **Name**: `vizoalica`. **Version**: the repository release version. **License**: MIT. **Engines**: Node.js
  `>=22`. **Platforms**: macOS and Linux (other platforms get a plain message at start). **Dependencies**:
  none at run time.
- **Bin**: `vizoalica` → `dist/cli.mjs`.
- **Provenance**: published from GitHub Actions with npm provenance.

### Files (allowlist; the tarball contains exactly these)

| Path                       | Contents                                                                          |
| -------------------------- | --------------------------------------------------------------------------------- |
| `dist/cli.mjs`             | The CLI and the local service, bundled                                            |
| `dist/console/`            | The built console (HTML, hashed assets, brand images)                             |
| `dist/worker/index.mjs`    | The Worker, prebundled                                                            |
| `dist/worker/wrangler.template.toml` | The deployment configuration template (`no_bundle`, placeholders only)  |
| `dist/schema/*.sql`        | Every numbered database change (`0001_…` upward), in order, at the same version; the highest number is the schema version this package expects |
| `dist/sdk/vizoalica.js`, `dist/sdk/vizoalica-loader.js` | The browser SDK files                                  |
| `README.md`, `LICENSE`, `CHANGELOG.md`, `package.json` | Metadata                                              |

Nothing else. A build test fails if the tarball lists any other file, any file matching a secret pattern
(`*.production.toml`, `.env*`, `local-operations.json`, keys), any absolute local path, or any account
identifier.

## Commands after this release

`vizoalica <command>`; `vizoalica --version`; `vizoalica help`.

| Command                | Status                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `console`              | The front door. Starts the service and console as one process, prints the address, opens the browser (`--no-open` to skip), stops everything on one interrupt. Starts with no environment yet; every environment, deploy, update, and role action happens inside it |
| `status`, `doctor`, `verify` | From the package these print where to go (`vizoalica console`, or a source checkout) and exit 2; unchanged in a checkout |
| `connect`, `backend`, `rotate`, `purge-deleted`, `demo`, `setup`, `deploy-pages` | Kept in a checkout for scripts and advanced use (single-environment, checkout-native, unrelated to the console's environment model); from the package they print where to go and exit 2 |
| `install`              | **Retired**: prints "vizoalica install was retired. Run `vizoalica console`; it guides setup.", does nothing else, exit code 2 |

### `vizoalica console` behavior

| Situation                                | Behavior                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| Node older than 22, or unsupported OS    | One plain message naming the requirement and the fix; exit code 1; no stack trace           |
| Port 4318 busy                           | "A console is probably running already. Open http://127.0.0.1:4318, or stop it (Ctrl+C in its terminal)." exit code 1 |
| No saved environment                     | Starts the service unconfigured; the console shows first run, including naming the first environment |
| One or more saved environments           | Starts with the previously active one selected; the console's switcher shows the rest              |
| Any environment in OneCLI mode           | That environment's routes are wrapped through `onecli run …` as today; other environments are unaffected |
| No display / cannot open a browser       | Prints the address                                                                          |

Process environment variables (distinct from Vizoalica "environments" above, which are console-managed, not
process-managed): `VIZOALICA_WRANGLER` overrides the deployment tool command for every Vizoalica environment;
`NODE_OPTIONS` under OneCLI keeps the existing warning suppression. A Cloudflare API token for a `token`-mode
Vizoalica environment is entered once in the console and saved in that environment's own file (R25), not read
from the process environment, so that two environments never share one ambient `CLOUDFLARE_API_TOKEN`.

## Build and checks

`pnpm package:build` assembles `apps/cli/package` and a publishable `package.json`; `pnpm package:check` runs
`npm pack`, compares the file list to the allowlist, installs the tarball into a temporary prefix, starts
`vizoalica console` on a spare port, and asserts: `--version`, `GET /` returns the console, `GET
/api/setup/state` says `needsFirstRun`, `/api/sdk/vizoalica.js` is served, a path-traversal request is
refused, and the process stops on interrupt. CI runs it on every pull request.

## Publishing

`.github/workflows/publish.yml` runs on a published release and on manual dispatch, needs
`id-token: write`, runs the package check, and `npm publish --provenance --access public`. It runs only when
the repository variable `VIZOALICA_NPM_PUBLISH` is `true`; otherwise it reports "publishing is not set up"
and is skipped, not failed. The first publish, the npm account, and two-factor authentication are the
owner's actions and are described in `docs/operations/releases.md`.
