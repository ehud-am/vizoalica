# Environments

An **environment** is one Vizoalica backend you can work on: its Worker address, the role you use it with,
and the secret for that role. Keep as many as you need (`dev`, `stage`, `prod`). They are set up **before**
the console starts, with `vizoalica env`, and the console only lets you pick between the ones that work.

## The file

Environments live in one file you can read and edit, in the spirit of Claude's own list of MCP servers:
`~/.config/vizoalica/environments.json`, readable only by you (`chmod 600`).

```json
{
  "version": 1,
  "environments": {
    "prod": {
      "url": "https://analytics.example.com",
      "role": "admin",
      "secret": "the administrator secret",
      "cloudflare": { "token": "an optional Cloudflare API token" }
    },
    "stage": {
      "url": "https://stage-vizoalica-ingest.example.workers.dev",
      "role": "analyst",
      "secret": {
        "onecli": { "workspace": "acme", "agent": "vizoalica", "gateway": "127.0.0.1:10255" }
      }
    }
  }
}
```

- **`url`**: the Worker's address. A `workers.dev` address or a **custom domain** both work. Give just the
  origin (`https://analytics.example.com`), with no path.
- **`role`**: `admin`, `owner` (a website owner), or `analyst`. `secret` is the administrator secret for
  `admin`, and an access key for the other two.
- **`secret`** and **`cloudflare.token`**: the value itself, or `{ "onecli": { workspace, agent, gateway } }`
  when [OneCLI](onecli.md) holds it as a local vault. (OneCLI's own command still names the workspace flag
  `--project`; Vizoalica maps it for you.) `cloudflare` is for admins only and optional.
- **Names** are lowercase letters, digits, and dashes, starting with a letter.

The console re-reads the file, so a hand edit is picked up without a restart. It never writes to it. The last
environment you selected is remembered separately, in `preferences.json`.

## `vizoalica env`

| Command                   | What it does                                                             |
| ------------------------- | ------------------------------------------------------------------------ |
| `vizoalica env list`      | Show each environment, its role, where its secret lives, and if it works |
| `vizoalica env add [N]`   | Add one: deploy a new backend for it, or connect one that exists         |
| `vizoalica env update N`  | Change one; whatever you do not mention is kept                          |
| `vizoalica env remove N`  | Forget one on this computer (nothing in Cloudflare is deleted)           |
| `vizoalica env check [N]` | Verify all (or one); exits non-zero if any is unusable                   |

In a terminal, `add` asks for everything you did not give as an option, one question at a time, each explained
above its prompt: the name (when not given), whether to **deploy** a new backend now (then it runs
[`vizoalica deploy`](deploy.md) for you) or **connect** to one that exists, and, when connecting, the Worker
address, your role, whether OneCLI holds the secret, the secret itself (hidden), and, for an admin, an optional
Cloudflare API token. An answer it cannot use is asked again with the reason. If the environment does not
verify, it offers to save it anyway. Ctrl-C stops without changing anything.

Options for `add` and `update`: `--url`, `--role`, `--secret-stdin` (the secret is never an argument, so it
stays out of your shell history), `--secret-onecli` with `--onecli-workspace`, `--onecli-agent`, and
`--onecli-gateway`, `--cloudflare-token-stdin`, `--cloudflare-onecli`, `--no-cloudflare`, and `--no-verify`.
Only for `add`: `--deploy` or `--connect`, `--onecli` or `--no-onecli`, and, with `--deploy`, the
[`deploy` options](deploy.md) `--yes`, `--account`, `--secrets-file`, `--resume`, and `--save-cloudflare`.
Without a terminal, every question must be given as an option; contradictory options are refused before
anything is asked. Add `--verbose` to see each step (never a secret or an answer). In a checkout, run it as
`pnpm vizoalica env`.

Lost a secret, or think one was exposed? [`vizoalica rotate NAME token`](deploy.md#replace-a-secret-vizoalica-rotate)
(or `admin`, `digest`, `all`) replaces it on the Worker and, for `admin`, in this file.

## What is checked

`add`, `update`, `check`, and the console all use the same checks. An environment is **usable** when:

1. its secret can be used (for OneCLI: OneCLI is installed and answers);
2. the Worker accepts it;
3. the role the Worker reports for it is the role you chose (an analyst key saved as `admin` is refused,
   saying what it really is);
4. the Worker and database versions work with this console; and
5. a Cloudflare token, if given, is reported active by Cloudflare.

`add` and `update` do not save an environment that fails these, unless you pass `--no-verify`.

## When the console cannot start

With no usable environment, the console shows a welcome page: what is wrong with each environment (or that
there are none, or that the file is broken), and the exact `vizoalica env` command to fix it. Fix it, then
choose **Check again**.

The console does not deploy or update a backend. To create one, run `vizoalica deploy <name>` ([guide](deploy.md)),
which creates it and adds the environment for you.
