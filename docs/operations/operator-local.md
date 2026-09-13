# Start the local operator console

Returning operators should start here. Use the mode that created
`~/.config/vizoalica/local-operations.json`; do not choose a mode based only on which command is
more convenient.

| Mode           | Local file contains       | Correct startup                       | Never run                         |
| -------------- | ------------------------- | ------------------------------------- | --------------------------------- |
| Without OneCLI | Real administrator secret | API and web commands in two terminals | `pnpm ops run`                    |
| With OneCLI    | Literal `onecli-managed`  | `pnpm ops run` in one terminal        | `pnpm local-ops-api:dev` directly |

> **OneCLI configuration:** If `local-operations.json` contains `onecli-managed`, the API must be
> launched with `pnpm ops run`. Starting `pnpm local-ops-api:dev` directly sends the placeholder
> and results in HTTP 401. The API also refuses this direct launch when it can identify the
> placeholder configuration.

## Check the mode and status

From the reviewed Vizoalica checkout, run:

```sh
pnpm ops status
```

This reports the credential mode, Worker hostname, configuration path and permissions, expected
startup command, whether ports 4318 and 5173 are occupied, whether the API appears to be running
through OneCLI, and public-health and authenticated-access results. It does not print the
configuration or credential. Keep only one console instance running.

## Without OneCLI

```sh
cd /path/to/reviewed/vizoalica

# Terminal 1
pnpm local-ops-api:dev serve "$HOME/.config/vizoalica/local-operations.json"

# Terminal 2
pnpm admin-web:dev
```

Keep both terminals open. Press Ctrl+C in both terminals to stop the console. For one-time setup,
credential replacement, or removal, use [setup without OneCLI](local-analytics.md).

## With OneCLI

```sh
cd /path/to/reviewed/vizoalica
pnpm ops verify
pnpm ops run
```

Keep the wrapper terminal open. Press Ctrl+C once there to stop both processes. For one-time
setup, OneCLI grant changes, or revocation, use [setup with OneCLI](ops-cli.md).

## Never switch modes casually

Do not switch modes merely by changing the startup command or editing the JSON file. Intentionally
recreate the configuration through the setup procedure for the new mode, using its explicit
replacement option where documented. Then restart with the same mode that created it.

See [troubleshooting](troubleshooting.md) when status or startup fails.
