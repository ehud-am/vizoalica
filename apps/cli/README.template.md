# Vizoalica

Privacy-first, self-hosted web analytics that runs in your own Cloudflare account (Workers, D1, and R2).
No cookies, no third parties, and your data stays yours.

Website: <https://vizoalica.dev> · Source: <https://github.com/ehud-am/vizoalica>

## Why Vizoalica

- **Self-deployed, and your data never leaves your account.** Vizoalica runs on Cloudflare Workers, D1, and R2 that you own. No hosted service sits between you and your visitors' data, and nothing is sent to a third party.
- **Free to deploy, as often as you like.** MIT licensed, with no per-site, per-event, or per-seat fee from Vizoalica. Deploy as many environments and websites as you want; Cloudflare bills only the usage in your own account ([cost model](https://vizoalica.dev/operations/cost-model)).
- **Cookieless and privacy-first.** One script tag, nothing stored in visitors' browsers, and no form values, typed text, or session replay.
- **It learns your website, so people do not have to keep its metadata current.** Analytics usually needs someone to follow every site change and hand-maintain page names, event definitions, groupings, and funnels. Vizoalica is AI-first instead: you ask your assistant to learn your website (`/vizoalica learn`). It reads the accessibility markers your pages already carry (titles, headings, landmarks, ARIA roles, control labels) as hints to what each page and control means, combines them with what visitors actually did, and proposes the ontology: named pages and groups, the actions and events worth tracking, campaigns, funnels, and paths. You review a detailed, versioned proposal and decide; the assistant remembers your decisions and re-learns as the site changes. The direction is a deep, continuously updated understanding of your site, with the human analyst making every decision.

## Install

You need Node.js 22 or newer on macOS or Linux, and a Cloudflare account.

```sh
npm install -g vizoalica
vizoalica env add prod    # deploys a new backend for "prod", or connects one you already have
vizoalica console
```

`vizoalica env add` asks one question at a time and says what each is for. To deploy, it asks how to reach your
Cloudflare account: sign in in your browser (the default), or paste an API token with Workers Scripts: Edit,
D1: Edit, Workers R2 Storage: Edit, and Account Settings: Read (it links to a form with those filled in). It
creates a D1 database, an R2 bucket, and a Worker named `prod-vizoalica-…`. There is no secret to copy: the
admin key is saved for you in `~/.config/vizoalica/environments.json`, readable only by you. A website
with one script tag needs nothing else. Lost the secret? `vizoalica rotate prod admin` replaces it.

`vizoalica console` starts the console on your computer at <http://127.0.0.1:4318> and opens it in your browser,
on the environment you used last. If no environment works yet, it shows a welcome page that says what is wrong
and which `vizoalica env` command fixes it. Pick between environments (`dev`, `stage`, `prod`) from the top bar.

Press Ctrl+C once in the terminal to stop it.

## Learn your website

Let an AI assistant learn your website and propose its ontology (named pages, groups, actions, events, funnels, paths)
as a versioned spec. You review it, then apply it:

```sh
vizoalica mcp install --client claude-code && vizoalica skill install --client claude-code
vizoalica learn enable prod            # optional: shows the Worker variables that open a learning window
vizoalica spec init prod --website Shop
# in your assistant:  /vizoalica learn 20
vizoalica spec diff prod               # review
vizoalica spec apply prod              # store it as the latest spec and apply names, grouping rules and goals
vizoalica spec show prod               # print the latest spec (the console's Manage > Spec page shows it too)
```

With git, the spec folder is the source of truth. Without git, the backend keeps the latest version:
`vizoalica spec pull prod`, edit the files, `vizoalica spec apply prod`. Details:
[vizoalica.dev/operations/spec](https://vizoalica.dev/operations/spec).

## Count views of a README

A GitHub or npm README cannot run the script tag. For pages like these, switch on the **pixel** for a website
(console: website → **Edit** → _Count views from pages that cannot run scripts_; update the backend first with
`vizoalica deploy <name> --update`), then add a Markdown image to the README, with its own `path`:

```md
![](https://<backend>/v1/pixel.gif?website=<website-key>&path=/readme)
```

It is off by default because an image request carries no origin, so anyone who knows the website key can forge
views: use a separate website for READMEs. GitHub and npm proxy images, so counts there are rough and unique
visitors cannot be told apart. Details: [vizoalica.dev/operations/pixel](https://vizoalica.dev/operations/pixel).

## Update and uninstall

```sh
npm update -g vizoalica       # update
npm uninstall -g vizoalica    # remove the program
```

Your settings live in `~/.config/vizoalica/`. They survive updates and are not removed by uninstalling. The list of
environments (`environments.json`, which you can also edit by hand) is readable only by you. Delete the folder to forget everything.

## Commands

| Command                                              | What it does                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `vizoalica env add [name]`                           | Add an environment: deploy a new backend, or connect an existing one                                   |
| `vizoalica env list`, `update`, `remove`, `check`    | Show, change, forget, or verify environments                                                           |
| `vizoalica deploy <name> [--apply \| --update]`      | Create a backend on its own, or update it; `--update --all` does all                                   |
| `vizoalica rotate <name> <secret>`                   | Replace a secret: `admin`, `token`, `digest`, or `all`                                                 |
| `vizoalica console`                                  | Start the console (`--no-open` to skip opening the browser)                                            |
| `vizoalica mcp install --client <client>`            | Let Claude, Codex, or Cursor read your analytics and health                                            |
| `vizoalica skill install --client <client>`          | Teach Claude Code or Codex how Vizoalica works                                                         |
| `vizoalica learn status \| enable \| disable <name>` | Check or set up the learning window that lets pages describe themselves                                |
| `vizoalica spec <command>`                           | `init`, `validate`, `render`, `diff`, `apply`, `show`, `pull`, `export`, `import` for the website spec |
| `vizoalica help`, `vizoalica --version`              | Show the commands, or the installed version                                                            |

Add `--verbose` to any command to see what it is doing, step by step. It never prints a secret or your answers,
so the output is safe to share in an issue. Without a terminal, every question has an option instead
(`vizoalica env` and `vizoalica deploy` list them).

The console only listens on your own computer (`127.0.0.1`). The command talks only to the Workers you add, and
to Cloudflare when you deploy or rotate; for those two it runs the pinned Wrangler with `npm exec`, which npm
downloads the first time.

## More

Guides, privacy notes, and the deployment steps are at <https://vizoalica.dev>. Report a problem or a question at
<https://github.com/ehud-am/vizoalica/issues>. MIT licensed.

<!-- readme-pixel:start -->
<!-- readme-pixel:end -->
