# Vizoalica

Privacy-first, self-hosted web analytics that runs in your own Cloudflare account (Workers, D1, and R2).
No cookies, no third parties, and your data stays yours.

Website: <https://vizoalica.dev> · Source: <https://github.com/ehud-am/vizoalica>

## Install

You need Node.js 22 or newer on macOS or Linux.

```sh
npm install -g vizoalica
vizoalica console
```

`vizoalica console` starts the console on your computer at <http://127.0.0.1:4318> and opens it in your browser.
The first time, it asks who you are (an admin, a website owner, or an analyst) and adapts. It keeps you on the
path: a running console, then a backend in your Cloudflare account, then your websites, then results. Anything that
cannot work yet is shown as unavailable, with the reason and the next step.

Press Ctrl+C once in the terminal to stop it.

## Update and uninstall

```sh
npm update -g vizoalica       # update
npm uninstall -g vizoalica    # remove the program
```

Your settings live in `~/.config/vizoalica/`. They survive updates and are not removed by uninstalling. The connection
file there is readable only by you. Delete the folder to forget everything.

## Commands

| Command               | What it does                                                |
| --------------------- | ----------------------------------------------------------- |
| `vizoalica console`   | Start the console (`--no-open` to skip opening the browser) |
| `vizoalica help`      | Show the commands                                           |
| `vizoalica --version` | Print the installed version                                 |

The console only listens on your own computer (`127.0.0.1`), and the package makes no network request on its own.

## More

Guides, privacy notes, and the deployment steps are at <https://vizoalica.dev>. Report a problem or a question at
<https://github.com/ehud-am/vizoalica/issues>. MIT licensed.
