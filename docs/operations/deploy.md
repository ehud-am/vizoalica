# Create a backend with `vizoalica deploy`

`vizoalica deploy <name> --apply` creates the backend for an [environment](environments.md): a D1 database, an R2 bucket,
and a Worker in your Cloudflare account, all named `<name>-vizoalica-…` so several environments can share one
account. It works from the installed package (no source checkout).

| You want to…          | Run                             | What happens                                              |
| --------------------- | ------------------------------- | --------------------------------------------------------- |
| See what would happen | `vizoalica deploy prod`         | Prints the resources and stops; nothing is created        |
| Create it             | `vizoalica deploy prod --apply` | Creates everything, then adds `prod` to your environments |

`deploy` is for a **new** backend; to update an existing one use `pnpm vizoalica backend` from a source
checkout. Infrastructure-as-code output is not offered yet.

## Create it (`--apply`)

You need a Cloudflare API token with **Workers Scripts: Edit, D1: Edit, Workers R2 Storage: Edit, and Account
Settings: Read**, and R2 enabled on the account (Cloudflare dashboard → R2 Object Storage).

```sh
export CLOUDFLARE_API_TOKEN=...          # or pipe it: --cloudflare-token-stdin, or use OneCLI (below)
vizoalica deploy prod --apply
```

It shows what it will create and the account, and asks you to type `yes`. Then it: checks access, refuses if any
of the three names already exists (it never changes or deletes anything that exists), creates the database and
bucket, writes the deployment configuration (kept, `0600`, under `~/.config/vizoalica/deploy/`), creates the
tables from the packaged migrations, deploys the packaged Worker, generates and stores three secrets, checks the
Worker's `/healthz`, and adds `prod` to `environments.json` as an `admin` environment, verified.

**Secrets.** The administrator secret goes straight into the environment file and is never printed. The other
two (`VIZOALICA_TOKEN_SECRET`, for each website's token endpoint, and `VIZOALICA_ANALYTICS_DIGEST_SECRET`) are
shown **once** in the terminal, or written to a new private file with `--secrets-file <path>` (required without
a terminal). Save them in a password manager.

| Option                                                                       | Meaning                                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `--yes`                                                                      | Do not ask for confirmation (required without a terminal)                      |
| `--account <id>`                                                             | The account, when the token can see more than one (otherwise you are asked)    |
| `--cloudflare-token-stdin`                                                   | Read the token from stdin; otherwise `$CLOUDFLARE_API_TOKEN`, otherwise asked  |
| `--cloudflare-onecli` + `--onecli-workspace/--onecli-agent/--onecli-gateway` | Run Wrangler under [OneCLI](onecli.md), which holds the token                  |
| `--save-cloudflare`                                                          | Keep the Cloudflare credential in the new environment (optional)               |
| `--secrets-file <path>`                                                      | Write the two other secrets to a new `0600` file instead of printing them      |
| `--resume`                                                                   | After a failure, continue: reuse the database or bucket an earlier run created |

The token is given to Wrangler only through its environment, never as an argument. If a step fails, the
message names the step and the likely cause (not signed in, a missing permission, R2 not enabled, no network)
and tells you to continue with `--resume`. A custom domain is not attached by `--apply`: attach it in Cloudflare,
then `vizoalica env update prod --url https://analytics.example.com`.
