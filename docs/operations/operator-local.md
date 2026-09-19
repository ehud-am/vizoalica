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

## Using the console

The console has two areas, shown as two groups in the left navigation.

- **Analytics** is for reading. It contains Overview, Pages, Sources, Geography, Technology, and
  Traffic quality, and nothing in it can change or delete anything.
- **Manage** is for setting up. It contains Projects, Websites, and Health. Deleting or disabling
  something lives in a separate danger zone and asks you to confirm by name.

**Websites** is a list of cards, one per website. Open a card to reach that website's own page:
its origins, identifiers, status, and the actions **Edit**, **Install**, and **View analytics**,
with enable, disable, and delete kept apart in a danger zone. **Edit** and **Add website** are
pages of their own with a back link, and they ask before you leave with unsaved changes.
**Install** asks how the website is deployed (GitHub → Cloudflare Pages, or paste a snippet),
lists the steps, and ends with **Check now**, which reads the last 24 hours of page views.

The project and website you are looking at are chosen once, in the bar under the header. That
choice, and the time range, follow you between screens and are remembered when you reload.

**Geography** shows countries by full name on a world map, a table of every country (sortable), and
totals by continent. Traffic through the Tor network or with no determinable location is labelled
as such. Only country and continent are shown. See the
[audience attributes review](../privacy/audience-attributes-review.md) for why nothing finer is
collected.

The complete country list, and lists of more than ten pages or sources, need the current backend.
After updating Vizoalica, redeploy the Worker (`pnpm vizoalica backend`). Until then the console
still works and shows the top ten with the rest grouped as "Other".

## Never switch modes casually

Do not switch modes merely by changing the startup command or editing the JSON file. Intentionally
recreate the configuration with the setup guide for the new mode
([without OneCLI](local-analytics.md), [with OneCLI](onecli.md)), using its explicit replacement
option where documented. Then start with `pnpm vizoalica console` as usual.

See [troubleshooting](troubleshooting.md) when status or startup fails.
