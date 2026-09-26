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

## Access keys: giving someone else a role

An administrator can let an **analyst** (view only) or a **website owner** (manage websites and projects) connect
without the administrator secret. Open **Access keys** from the environment menu (or a website's Share section),
choose who it is for, the role, and what it reaches (everything, one project, or one website), and issue it. The
key is shown once; the page then shows what to do with it.

**Nothing is deployed.** The backend accepts a key from the moment it is issued, and revoking it there stops it at
once, on every computer. The person who receives the key (send it through a password manager, not chat or email)
adds an environment for this backend to their own console, with the role of the key. There are three ways to keep it:

**In a private file** (asks questions, key hidden):

```sh
vizoalica env add dev-analyst --connect --url https://YOUR_WORKER_ADDRESS --role analyst
# paste the key when asked; answer n to "stored in OneCLI"
vizoalica env check dev-analyst
```

**In OneCLI** (the key is never saved on the computer; Vizoalica keeps only the placeholder `onecli-managed`).
Create a Generic secret with host = the Worker's host, header `Authorization`, format `Bearer {value}` and the key as
the value, attached only to the agent that will use it, then point the environment at it:

```sh
onecli secrets create --project PROJECT --name "Vizoalica analyst key dev-analyst" --type generic \
  --host-pattern YOUR_WORKER_HOST --header-name Authorization --value-format 'Bearer {value}' --file ./key.txt
vizoalica env add dev-analyst --connect --url https://YOUR_WORKER_ADDRESS --role analyst \
  --secret-onecli --onecli-workspace WORKSPACE --onecli-agent AGENT --onecli-gateway 127.0.0.1:10255
```

**From a script** (the key comes from standard input, so it is not in the command line or shell history):

```sh
read -rs KEY && printf '%s' "$KEY" | vizoalica env add dev-analyst --connect \
  --url https://YOUR_WORKER_ADDRESS --role analyst --secret-stdin --no-onecli
```

Then `vizoalica console` and choose the environment at the top. A revoked key is reported by
`vizoalica env check` as rejected, with a hint to ask for a new one.
