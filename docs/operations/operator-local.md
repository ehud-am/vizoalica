# Start the local operator console

Returning operators start here. One command starts the console in either credential mode:

```sh
cd /path/to/reviewed/vizoalica
pnpm vizoalica console
```

It reads `~/.config/vizoalica/local-operations.json` to decide how to start the private API, then
starts the web console beside it. Open `http://127.0.0.1:5173` (or the URL Vite prints). Keep the
terminal open and press Ctrl+C once to stop both processes. Keep only one console instance
running. `pnpm vizoalica run` is an alias for the same command.

| Mode           | The local file contains   | What `pnpm vizoalica console` does                                  |
| -------------- | ------------------------- | ------------------------------------------------------------------- |
| Without OneCLI | Real administrator secret | Starts the API with that file, then the web console                 |
| With OneCLI    | Literal `onecli-managed`  | Starts the API inside `onecli run` so OneCLI injects the credential |

Never start the API yourself with `pnpm local-ops-api:dev` when the file contains
`onecli-managed`: it would send the placeholder and get HTTP 401, and the API refuses that launch
when it can identify the placeholder.

## Check the mode and status

```sh
pnpm vizoalica status
```

This reports the credential mode, Worker hostname, configuration path and permissions, whether
ports 4318 and 5173 are occupied, whether the API appears to be running through OneCLI, and the
public-health and authenticated-access results. It never prints the configuration or a credential.
`pnpm vizoalica verify` runs only the authenticated check.

## Never switch modes casually

Do not switch modes merely by changing the startup command or editing the JSON file. Intentionally
recreate the configuration with the setup guide for the new mode
([without OneCLI](local-analytics.md), [with OneCLI](onecli.md)), using its explicit replacement
option where documented. Then start with `pnpm vizoalica console` as usual.

See [troubleshooting](troubleshooting.md) when status or startup fails.
