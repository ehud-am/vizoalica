# Setup and operations

Explain these steps; the user runs them. Steps that create or show secrets must run in the user's own
terminal, not through an agent. Requirements: Node.js 22+, macOS or Linux (Windows: use WSL), a Cloudflare
account with R2 enabled.

## First setup

1. `npm install -g vizoalica`
2. `vizoalica env add prod`: deploys a new backend in the user's Cloudflare account (or connects to one
   that exists). Deploying needs a Cloudflare API token with Workers Scripts: Edit, D1: Edit, Workers R2
   Storage: Edit, Account Settings: Read. It shows no secret: the administrator secret is saved in
   `~/.config/vizoalica/environments.json`. OneCLI is used only with its options.
3. `vizoalica console`: opens the console at `http://127.0.0.1:4318`.
4. In the console, **Websites → Add website**, then follow its Install page. By default that is one
   script tag, served by the backend, for any host. Only a website with **Require a signed token** on
   needs a token endpoint (GitHub → Cloudflare Pages, or a pasted snippet) and `VIZOALICA_TOKEN_SECRET`,
   which the user gets the first time with `vizoalica rotate <name> token` (shown once).
5. Publish the site, open it, then **Check now** on the Install page.

## AI assistant

- `vizoalica mcp install --client claude-code|claude-desktop|codex|cursor` adds the read-only MCP server.
  It uses every environment on the computer; secrets stay in the `vizoalica` process.
- `vizoalica skill install --client claude-code|codex` installs this skill.
- After changing Node.js versions, run `vizoalica mcp install` again (it records the Node.js path).

## More than one backend (environments)

Most users have one backend; call it "your backend". Each backend on a computer is an environment.

- `vizoalica env list`: every environment and whether it works.
- `vizoalica env check [name]`: verify; says whether the secret was rejected, the role is wrong, the Worker
  is unreachable, or versions do not fit.
- `vizoalica env update <name>` / `vizoalica env remove <name>` (remove forgets it locally; nothing in
  Cloudflare is deleted).
- A teammate's computer: install, then `vizoalica env add <name>` and choose to connect to the existing
  backend. Owners and analysts use an access key an admin creates in the console (**Share access**, in
  the backend menu). See docs/operations/share.md.
- Advanced: OneCLI can hold secrets instead of a private file (`--onecli`, `--secret-onecli`).

## Updates

- Console/command: `npm update -g vizoalica`.
- Backend (Worker and database): `vizoalica deploy <name> --update`, after updating the package
  (see docs/operations/deploy.md). `get_environment_status` says which side needs updating.

## Secrets

- `VIZOALICA_ADMIN_SECRET`: the console's admin credential; kept in the environment file or OneCLI.
- `VIZOALICA_TOKEN_SECRET`: shared by the Worker and the token endpoint of each website that requires signed tokens.
- `VIZOALICA_ANALYTICS_DIGEST_SECRET`: Worker only.
- Lost or leaked: `vizoalica rotate <name> <admin|token|digest|all>`. After rotating `token`, every
  website that requires signed tokens needs the new value; script-tag websites are not affected.

## Removing data

Deleting a website or project in the console is permanent; a daily cleanup removes its data.

Docs: https://vizoalica.dev
