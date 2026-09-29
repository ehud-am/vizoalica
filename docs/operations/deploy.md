# Create a backend with `vizoalica deploy`

`vizoalica deploy <name> --apply` creates your backend: a D1 database, an R2 bucket, and a Worker in your
Cloudflare account, all named `<name>-vizoalica-…` so [several backends](environments.md) can share one
account. It works from the installed package (no source checkout). Most people never type it:
`vizoalica env add <name>` asks whether to deploy a new backend and runs it for you.

| You want to…          | Run                              | What happens                                            |
| --------------------- | -------------------------------- | ------------------------------------------------------- |
| See what would happen | `vizoalica deploy prod`          | Prints the resources and stops; nothing is created      |
| Create it             | `vizoalica deploy prod --apply`  | Creates everything, then saves `prod` on this computer  |
| Update it             | `vizoalica deploy prod --update` | Deploys this version over it; data and secrets are kept |

Infrastructure-as-code output is not offered yet.

## Create it (`--apply`)

You need a Cloudflare API token with **Workers Scripts: Edit, D1: Edit, Workers R2 Storage: Edit, and Account
Settings: Read**, and R2 enabled on the account (Cloudflare dashboard → R2 Object Storage).

```sh
export CLOUDFLARE_API_TOKEN=...          # or pipe it: --cloudflare-token-stdin
vizoalica deploy prod --apply
```

It shows what it will create and the account, and asks you to type `yes`. Then it: checks access, refuses if any
of the three names already exists (it never changes or deletes anything that exists), creates the database and
bucket, writes the deployment configuration (kept, `0600`, under `~/.config/vizoalica/deploy/`), creates the
tables from the packaged migrations, deploys the packaged Worker, generates and stores three secrets, checks the
Worker's `/healthz`, and adds `prod` to `environments.json` as an `admin` environment, verified.

**Secrets.** Nothing is shown and there is nothing to copy. The administrator secret goes straight into
`environments.json` and is never printed. The Worker's other two secrets stay on the Worker:
`VIZOALICA_ANALYTICS_DIGEST_SECRET` is used only by the Worker, and `VIZOALICA_TOKEN_SECRET` is needed only by
websites that [require signed tokens](pages.md#signed-tokens-optional). When the first such website needs it, get
it with `vizoalica rotate prod token`, which makes a new one and shows it once. For a backup copy of all of them,
pass `--secrets-file <path>`.

| Option                     | Meaning                                                                        |
| -------------------------- | ------------------------------------------------------------------------------ |
| `--yes`                    | Do not ask for confirmation (required without a terminal)                      |
| `--account <id>`           | The account, when the token can see more than one (otherwise you are asked)    |
| `--cloudflare-token-stdin` | Read the token from stdin; otherwise `$CLOUDFLARE_API_TOKEN`, otherwise asked  |
| `--save-cloudflare`        | Keep the Cloudflare credential with the backend on this computer (optional)    |
| `--secrets-file <path>`    | Also write every generated secret to a new `0600` file, as a backup            |
| `--resume`                 | After a failure, continue: reuse the database or bucket an earlier run created |

The token is given to Wrangler only through its environment, never as an argument. If a step fails, the
message names the step and the likely cause (not signed in, a missing permission, R2 not enabled, no network)
and tells you to continue with `--resume`. A custom domain is not attached by `--apply`: attach it in Cloudflare,
then `vizoalica env update prod --url https://analytics.example.com`.

To keep the Cloudflare token in a vault instead of the environment, see [OneCLI](onecli.md).

## Update it (`--update`)

After you update the `vizoalica` package (`npm update -g vizoalica`), bring each backend to the same version:

```sh
vizoalica deploy prod --update
```

It shows what it will change and asks you to type `yes`. Then it checks access, finds the existing database and
bucket (it stops and changes nothing if either is missing), rewrites the kept deployment configuration, applies
the database migrations this version adds (only those not applied yet), deploys the packaged Worker, generates a
secret only if the Worker is missing one, checks `/healthz`, and checks the environment still works. The console
says when a backend needs this: its Health page shows the Worker and schema versions against the console's.

It takes the same credential and account options as `--apply` (`--resume` does not apply), and uses the
Cloudflare token saved with the environment (`--save-cloudflare`) when there is one, and the account the
backend was deployed in. On this computer the environment must be `admin`; if this computer does not have it
yet, a new administrator secret (only when the Worker was missing one) adds it.

## Replace a secret: `vizoalica rotate`

Lost a secret, think one was exposed, or need the token secret for your first signed-token website? Replace it
on the Worker with a new one:

```sh
vizoalica rotate prod token     # or: admin | digest | all
```

It says what the change affects, asks you to type `rotate`, stores the new value on the Worker (the old one stops
working at once), and then:

- **`admin`**: updates `prod` in `environments.json` for you and checks it works. Anyone else who uses `prod` as
  admin needs the new value (`vizoalica env update prod --secret-stdin`). If OneCLI holds it, the new value is
  shown so you can replace it there.
- **`token`**: shows the new `VIZOALICA_TOKEN_SECRET` once and waits until you type `saved`. Only websites that
  require signed tokens use it; websites with the plain script tag are not affected. Give it to each such
  website's token endpoint (for example its `VIZOALICA_TOKEN_SECRET` GitHub secret) and re-deploy the site.
  Until then that site's events are rejected. The first time, no website uses it yet, so nothing breaks.
- **`digest`**: unique-visitor counts restart; nothing else needs updating.

It uses the Cloudflare token saved with the environment, else `--cloudflare-token-stdin`, `$CLOUDFLARE_API_TOKEN`,
or asks; the token needs Workers Scripts: Edit. Without a terminal it needs `--yes` and, for a secret it has to
hand over, `--secrets-file <new file>`. The Worker is the one `vizoalica deploy` created, or the one named by a
`workers.dev` address; for a custom domain give `--worker <name>`.
