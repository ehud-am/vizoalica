# Vizoalica

Privacy-first, self-hosted web analytics that runs in your own Cloudflare account (Workers, D1, and R2).
No cookies, no third parties, and your data stays yours.

Website: <https://vizoalica.dev> · Source: <https://github.com/ehud-am/vizoalica>

## Install

You need Node.js 22 or newer on macOS or Linux, and a Cloudflare account.

```sh
npm install -g vizoalica
vizoalica env add prod    # deploys a new backend for "prod", or connects one you already have
vizoalica console
```

`vizoalica env add` asks one question at a time and says what each is for. To deploy, it needs a Cloudflare
API token with Workers Scripts: Edit, D1: Edit, Workers R2 Storage: Edit, and Account Settings: Read. It
creates a D1 database, an R2 bucket, and a Worker named `prod-vizoalica-…`, then shows the two secrets you must
keep, **last, and waits until you type `saved`**. Save them in a password manager: every website you add needs
`VIZOALICA_TOKEN_SECRET`. Lost one? `vizoalica rotate prod token` replaces it.

`vizoalica console` starts the console on your computer at <http://127.0.0.1:4318> and opens it in your browser,
on the environment you used last. If no environment works yet, it shows a welcome page that says what is wrong
and which `vizoalica env` command fixes it. Pick between environments (`dev`, `stage`, `prod`) from the top bar.

Press Ctrl+C once in the terminal to stop it.

## Update and uninstall

```sh
npm update -g vizoalica       # update
npm uninstall -g vizoalica    # remove the program
```

Your settings live in `~/.config/vizoalica/`. They survive updates and are not removed by uninstalling. The list of
environments (`environments.json`, which you can also edit by hand) is readable only by you. Delete the folder to forget everything.

## Commands

| Command                                           | What it does                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| `vizoalica env add [name]`                        | Add an environment: deploy a new backend, or connect an existing one |
| `vizoalica env list`, `update`, `remove`, `check` | Show, change, forget, or verify environments                         |
| `vizoalica deploy <name> [--apply]`               | Create a backend on its own (without `--apply`, only show the plan)  |
| `vizoalica rotate <name> <secret>`                | Replace a secret: `admin`, `token`, `digest`, or `all`               |
| `vizoalica console`                               | Start the console (`--no-open` to skip opening the browser)          |
| `vizoalica help`, `vizoalica --version`           | Show the commands, or the installed version                          |

Add `--verbose` to any command to see what it is doing, step by step. It never prints a secret or your answers,
so the output is safe to share in an issue. Without a terminal, every question has an option instead
(`vizoalica env` and `vizoalica deploy` list them).

The console only listens on your own computer (`127.0.0.1`). The command talks only to the Workers you add, and
to Cloudflare when you deploy or rotate; for those two it runs the pinned Wrangler with `npm exec`, which npm
downloads the first time.

## More

Guides, privacy notes, and the deployment steps are at <https://vizoalica.dev>. Report a problem or a question at
<https://github.com/ehud-am/vizoalica/issues>. MIT licensed.
