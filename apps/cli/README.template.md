# Vizoalica

Privacy-first, self-hosted web analytics that runs in your own Cloudflare account (Workers, D1, and R2).
No cookies, no third parties, and your data stays yours.

Website: <https://vizoalica.dev> · Source: <https://github.com/ehud-am/vizoalica>

## Install

You need Node.js 22 or newer on macOS or Linux.

```sh
npm install -g vizoalica
vizoalica deploy prod --apply   # create a backend in your Cloudflare account and add it
                                # (or: vizoalica env add prod, for a backend you already have)
vizoalica console
```

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

| Command               | What it does                                                |
| --------------------- | ----------------------------------------------------------- |
| `vizoalica deploy`    | Create a backend in your Cloudflare account (`--apply`)     |
| `vizoalica env`       | List, add, update, remove, and check environments           |
| `vizoalica console`   | Start the console (`--no-open` to skip opening the browser) |
| `vizoalica help`      | Show the commands                                           |
| `vizoalica --version` | Print the installed version                                 |

The console only listens on your own computer (`127.0.0.1`), and the package makes no network request on its own.

## More

Guides, privacy notes, and the deployment steps are at <https://vizoalica.dev>. Report a problem or a question at
<https://github.com/ehud-am/vizoalica/issues>. MIT licensed.
