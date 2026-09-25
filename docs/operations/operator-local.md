# Start the local operator console

Returning operators start here. The console works on **environments** (`dev`, `stage`, `prod`, or any
names you chose), which you add once with `vizoalica env` and can review or edit any time. Then one
command starts the console:

```sh
vizoalica env list        # what is configured, and whether each one works
vizoalica console         # from a source checkout: pnpm vizoalica env list, pnpm vizoalica console
```

With the npm package it opens `http://127.0.0.1:4318` (see [From the npm package](#from-the-npm-package)). From a
checkout it starts the private API and the web console beside it; open `http://127.0.0.1:5173` (or the URL Vite
prints). Keep the terminal open and press Ctrl+C once to stop both processes. Keep only one console
instance running. `pnpm vizoalica run` is an alias for the same command.

Environments are never managed inside the console. When none is usable (none added yet, a token that was
revoked, a wrong role, an unreachable Worker), the console opens a welcome page that says what is wrong
with each one and which `vizoalica env` command fixes it. With at least one usable environment it opens on
the one you used last; the picker in the top bar switches between them. See
[Environments](environments.md) for the file, the commands, and what is checked.

| Where the secret lives | In `environments.json`                            | What happens on a request                                                        |
| ---------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| In the file            | `"secret": "…"` (mode `0600`)                     | The console calls the Worker directly                                            |
| In OneCLI              | `"secret": { "onecli": { workspace, agent, … } }` | A small helper started under `onecli run` for that environment makes the request |

The console itself is never started under OneCLI, so switching environments, or between the two ways of
holding a secret, needs no restart.

## From the npm package

If you installed the package with `npm install -g vizoalica`, there is no checkout and no separate web server.
`vizoalica console` starts the private API and serves the console itself on `http://127.0.0.1:4318`, opens
it in your browser, and stops on one Ctrl+C. Add your environments first with `vizoalica env add <name>`;
without any, it starts anyway and shows the welcome page explaining that. If the environments file can be
read by other users, or is damaged, the welcome page (and `vizoalica env list`) says so and prints the one
command that fixes it, and nothing from inside the file. Update with `npm update -g vizoalica`. `--no-open`
skips opening the browser.

## Check the mode and status

```sh
pnpm vizoalica status
```

This reports the credential mode, Worker hostname, configuration path and permissions, whether
ports 4318 and 5173 are occupied, and the public-health and authenticated-access results of the direct
operator credential. It never prints the configuration or a credential.
`pnpm vizoalica verify` runs only the authenticated check.

## Using the console

The console has two areas, shown as two groups in the left navigation.

- **Analytics** is for reading. It contains Overview, Pages, Actions, Sources, Geography,
  Technology, and Traffic quality, and nothing in it can change or delete anything.
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

**Pages** lists each page of your site with its views. A site that shows different screens without
loading a new address (fragment routes such as `#/pricing`, or a single-page app) is listed screen by
screen, and pages that differ only by an identifier are one row (`/orders/:id`).

**Actions** shows what visitors click, page by page: each row is a page and an action (a button or
link) with how many times it was used, by how many visitors, and how often per view of that page.
Choose a page to see everything visitors did on it, or an action to see every page it is used on.
The selection is kept in the address, so you can bookmark it or send it to another console user.
Actions appear for websites whose SDK file is version 0.6 or later. Nothing on this page changes a
setting.

The complete country list, and lists of more than ten pages or sources, need the current backend.
After updating Vizoalica, redeploy the Worker (`pnpm vizoalica backend`). Until then the console
still works and shows the top ten with the rest grouped as "Other".

## Never switch modes casually

Do not switch modes merely by changing the startup command or editing the JSON file. Intentionally
recreate the configuration with the setup guide for the new mode
([without OneCLI](local-analytics.md), [with OneCLI](onecli.md)), using its explicit replacement
option where documented. Then start with `pnpm vizoalica console` as usual.

See [troubleshooting](troubleshooting.md) when status or startup fails.
