# Research and decisions

## Installation path

Decision: native login for provisioning and Pages; independently choose OneCLI for the local administrator client. Rationale: lowest operational complexity and avoids the reported Pages upload JWT rewrite. Alternative: all deployment through the vault; retain the advanced Worker path, but do not claim Pages is supported through this integration.

## OneCLI

Decision: use `onecli run --gateway 127.0.0.1:10255` for a locally published Docker gateway. Verified in installed OneCLI 2.11.0 `help`. Keep CA and credential handling inside OneCLI. Generic secret uses exact Worker hostname, Authorization header and Bearer {value}; use dashboard fields because installed help omits header/value-format flags. Add a fixed non-secret token only to wrapped Wrangler, after ambient credential removal. No gateway or Pages bypass is implemented.

## Cloudflare

Verified 2026-09-09 against official documentation:

- [Function root](https://developers.cloudflare.com/pages/functions/get-started/): functions directory belongs in project root, outside static output.
- [Wrangler Pages commands](https://developers.cloudflare.com/workers/wrangler/commands/pages/): cwd, project create, deploy, secrets and local function compilation.
- [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) and [Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/): explicit deployment modes; uploading does not create a Git trigger.
- [Permission names](https://developers.cloudflare.com/fundamentals/api/reference/permissions/): User Memberships Read; Account Cloudflare Pages Edit.
- [Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/): static requests avoid Function cost; Function requests share Workers allowance.
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/): included usage is not a hard spending cap.

## Implementation findings

The checkout already has the Origin/Referer fix and tests, and a partially corrected snippet. Worker snippet metadata omits deployment endpoint. Generate HTML in local API using its configured remote URL, with attribute escaping and unknown consent. Latest source schema requires name and timestamps; correct SQL and rehearse all four migrations locally. Worker serves neither SDK nor token endpoint. Example must ship both. Provider operation catalog does not include Pages.

## Validation boundaries

The requested research subagent hit an account usage limit; research was completed locally. Live deployment and external sample repository changes are not necessary for this documentation patch. Local tests prove contract compatibility; actual remote acceptance remains a documented operator check.
