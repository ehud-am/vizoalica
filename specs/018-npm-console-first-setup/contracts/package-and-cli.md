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
| `env`                  | `list`, `add`, `update`, `remove`, `check` for `~/.config/vizoalica/environments.json` (Revision 3). Verifies before saving; secrets only from a hidden prompt or stdin; never prints a secret. In a terminal, `add` asks for each missing value with an explanation, re-asks an unusable answer, and offers to save one that does not verify |
| `console`              | Starts the service and console as one process, prints the address and the selected environment, opens the browser (`--no-open` to skip), stops everything on one interrupt. Always starts, even with no usable environment (the console then shows the welcome page) |
| `status`, `doctor`, `verify` | From the package these print where to go and exit 2; unchanged in a checkout |
| `connect`, `backend`, `purge-deleted`, `demo`, `setup`, `deploy-pages` | Kept in a checkout (they keep their own direct-credential file and are unrelated to the console's environments, except that `connect` suggests `vizoalica env add`); from the package they print where to go and exit 2 |
| `install`              | **Retired**: prints that it was retired and to add an environment with `vizoalica env add <name>` then run `vizoalica console`; exit code 2 |
| `deploy`               | Creates a backend with `--apply`; without it, shows the plan (feature 019) |
| `rotate`               | `rotate <environment> <admin\|token\|digest\|all>` replaces a secret on that environment's Worker (feature 019). In a checkout, `pnpm vizoalica rotate <secret>` (one word) is still the checkout install's own command |
| `--verbose`            | With any command: timed diagnostics on stdout (steps, questions, requests, Wrangler calls); never a secret, header, body, or answer |
| `serve`                | **Removed** (it existed only to run the service under `onecli run`)                            |

In a checkout, `pnpm vizoalica env ...` runs the same code.

### `vizoalica console` behavior

| Situation                                | Behavior                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| Node older than 22, or unsupported OS    | One plain message naming the requirement and the fix; exit code 1; no stack trace           |
| Port 4318 busy                           | "A console is probably running already. Open http://127.0.0.1:4318, or stop it (Ctrl+C in its terminal)." exit code 1 |
| No environments, a broken file, or none usable | Starts; prints that no environment is usable and to check `vizoalica env list`; the console shows the welcome page |
| At least one usable environment          | Starts on the previously selected one (`preferences.json`) or the first usable by name; prints `Environment: <name> (n of m usable)` |
| An environment whose secret is in OneCLI | Reached through a helper started under `onecli run` for that environment; the console process is never wrapped |
| No display / cannot open a browser       | Prints the address                                                                          |

The package ships the prebundled Worker and its Wrangler template (`dist/worker/*`) for `vizoalica deploy`
(feature 019); the console itself does not deploy.

## Build and checks

`pnpm package:build` assembles `apps/cli/package` and a publishable `package.json`; `pnpm package:check` runs
`npm pack`, compares the file list to the allowlist, installs the tarball into a temporary prefix, starts
`vizoalica console` on a spare port, and asserts: `--version`, `GET /` returns the console, `GET
/api/environments` lists none and selects none, `GET /api/setup/state` is `409`, `/api/sdk/vizoalica.js` is served, a path-traversal request is
refused, and the process stops on interrupt. CI runs it on every pull request.

## Publishing

`.github/workflows/publish.yml` runs on a published release and on manual dispatch, needs
`id-token: write`, runs the package check, and `npm publish --provenance --access public`. It runs only when
the repository variable `VIZOALICA_NPM_PUBLISH` is `true`; otherwise it reports "publishing is not set up"
and is skipped, not failed. The first publish, the npm account, and two-factor authentication are the
owner's actions and are described in `docs/operations/releases.md`.
