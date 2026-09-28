# Setup and operations

Explain these steps; the user runs them. Steps that create or show secrets must run in the user's own
terminal, not through an agent. Requirements: Node.js 22+, macOS or Linux (Windows: use WSL), a Cloudflare
account with R2 enabled.

## First setup

1. `npm install -g vizoalica`
2. `vizoalica env add prod`: deploys a new backend in the user's Cloudflare account (or connects to one
   that exists). Deploying needs a Cloudflare API token with Workers Scripts: Edit, D1: Edit, Workers R2
   Storage: Edit, Account Settings: Read. It shows `VIZOALICA_TOKEN_SECRET` and the digest secret once;
   the user must save them in a password manager.
3. `vizoalica console`: opens the console at `http://127.0.0.1:4318`.
4. In the console, **Websites → Add website**, then follow its Install page: GitHub → Cloudflare Pages
   (recommended) or paste a snippet. The site's token endpoint needs `VIZOALICA_TOKEN_SECRET`.
5. Open the site, grant analytics consent, then **Check now** on the Install page.

## AI assistant

- `vizoalica mcp install --client claude-code|claude-desktop|codex|cursor` adds the read-only MCP server.
  It uses every environment on the computer; secrets stay in the `vizoalica` process.
- `vizoalica skill install --client claude-code|codex` installs this skill.
- After changing Node.js versions, run `vizoalica mcp install` again (it records the Node.js path).

## Environments

- `vizoalica env list`: every environment and whether it works.
- `vizoalica env check [name]`: verify; says whether the secret was rejected, the role is wrong, the Worker
  is unreachable, or versions do not fit.
- `vizoalica env update <name>` / `vizoalica env remove <name>` (remove forgets it locally; nothing in
  Cloudflare is deleted).
- A teammate's computer: install, then `vizoalica env add <name>` and choose to connect to the existing
  backend. Owners and analysts use an access key an admin creates in the console (Manage → Access).
- OneCLI can hold secrets instead of a private file.

## Updates

- Console/command: `npm update -g vizoalica`.
- Backend (Worker and database): `vizoalica deploy <name> --update`, after updating the package
  (see docs/operations/deploy.md). `get_environment_status` says which side needs updating.

## Secrets

- `VIZOALICA_ADMIN_SECRET`: the console's admin credential; kept in the environment file or OneCLI.
- `VIZOALICA_TOKEN_SECRET`: shared by the Worker and each website's token endpoint.
- `VIZOALICA_ANALYTICS_DIGEST_SECRET`: Worker only.
- Lost or leaked: `vizoalica rotate <name> <admin|token|digest|all>`. After rotating `token`, every
  installed website needs the new value.

## Removing data

Deleting a website or project in the console is permanent; a daily cleanup removes its data.

Docs: https://vizoalica.dev
