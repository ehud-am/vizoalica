---
name: vizoalica-cloudflare-deploy
description: Safely plan, preflight, apply, verify, and inspect Vizoalica Cloudflare deployments using an explicit OneCLI or Cloudflare-native profile. Use for Vizoalica deployment work, OneCLI Cloudflare credential lifecycle, or deployment recovery.
---

# Vizoalica Cloudflare deployment

Keep credentials outside the repository and conversation. Read `docs/operations/cloudflare.md` and
the selected non-secret deployment profile. Never request, display, copy, or persist a Cloudflare
token, OneCLI credential, authorization header, or Worker secret value.

1. Run `pnpm deploy:plan -- --profile <profile> --out <private-plan>`.
2. Review the account, environment, provider, connection reference, resources, and mutations.
3. Run `pnpm deploy:check -- --profile <profile> --plan <private-plan> --receipt <private-receipt>`.
4. Display the exact plan ID and mutation list, then stop. Require explicit human approval of that
   exact plan ID before continuing. A valid credential or receipt is not approval.
5. After approval, run `pnpm deploy:apply -- --profile <profile> --plan <private-plan> --receipt
   <private-receipt> --approve <exact-plan-id>`.
6. Run `pnpm deploy:verify -- --profile <profile> --worker-url <https-url> --plan <private-plan>` and
   `pnpm deploy:status -- --profile <profile> --plan-id <exact-plan-id>`.

If profile, plan, configuration, actor, provider, account, connection, grant, or receipt validation
fails, stop before mutation. Never switch providers or use ambient Cloudflare authentication as a
fallback. After interruption or partial failure, report completed and pending operations and obtain
a fresh plan or receipt before retrying.
