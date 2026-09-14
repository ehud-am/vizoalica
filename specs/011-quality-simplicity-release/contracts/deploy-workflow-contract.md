# Contract: Reusable Deployment Workflow (`deploy-vizoalica-pages.yml`)

A customer website repository adopts this contract by calling the workflow via `workflow_call`.
This is the external interface Phase 1 must implement and keep stable across patch releases.

## Caller's workflow (what a customer adds to their own repo)

```yaml
name: Deploy website
on:
  push:
    branches: [main]
    paths: ["docs/**"]        # or whatever the customer's site path is

jobs:
  deploy:
    uses: ehud-am/vizoalica/.github/workflows/deploy-vizoalica-pages.yml@v0.5.2
    with:
      site-directory: docs
    secrets: inherit
```

## Inputs (`with:`)

| Input | Required | Description |
|---|---|---|
| `site-directory` | yes | Path, relative to repo root, of the static site to deploy |

## Required repository variables (`vars:`, via `secrets: inherit` + repo Settings → Variables)

`VIZOALICA_SDK_SRC`, `VIZOALICA_INGEST_ENDPOINT`, `VIZOALICA_PUBLIC_SOURCE_KEY`,
`VIZOALICA_PROJECT_ID`, `VIZOALICA_TOKEN_URL`, `VIZOALICA_CONSENT`, `VIZOALICA_SOURCE_ID`,
`VIZOALICA_SITE_ORIGINS` (comma-separated; include every hostname, e.g. apex + `www`, serving
this site), `CF_ACCOUNT_ID`, `CF_PAGES_PROJECT`.

## Required repository secrets (`secrets:`, via repo Settings → Secrets)

`CF_API_TOKEN` (Cloudflare Pages:Edit scope), `VIZOALICA_TOKEN_SECRET` (≥32 random chars).

## Behavior contract

1. On trigger, checks out the caller's own repository. It does **not** check out this (private)
   project's repository — a reusable workflow's `GITHUB_TOKEN` never carries cross-repo access to
   a private source repo, even one owned by the same account that granted this workflow's
   `access_level: user` reusable-workflow permission (that setting only controls which repos may
   *resolve* the `workflow_call`, not what `actions/checkout` can read).
2. Validates every required variable/secret is present and non-empty; on any missing/malformed
   value, fails the job with a message naming exactly which one, before any deploy action runs
   (FR-004). No partial or insecure deploy is attempted.
3. Writes `functions/vizoalica/{config.json.ts,ingest-token.ts}` and `vizoalica-loader.js` into
   the caller's build output under `site-directory`, decoded from a base64 copy embedded directly
   in this workflow file (kept in sync with the real source under
   `examples/cloudflare-pages/` by `pnpm run generate:deploy-workflow`, enforced in this
   project's own CI).
4. Generates an ephemeral `wrangler.toml` (not committed, exists only in the job's workspace)
   populating `[vars]` from the required variables above.
5. Runs `wrangler pages secret put VIZOALICA_TOKEN_SECRET` against the target Pages project
   (idempotent) using `CF_API_TOKEN`/`CF_ACCOUNT_ID`.
6. Runs `wrangler pages deploy <site-directory> --project-name <CF_PAGES_PROJECT>`.
7. On success, the job output includes the deployed URL. On failure at any step, the job fails
   with the underlying `wrangler`/Cloudflare error surfaced, not swallowed.

## One-time setup on this project's side (owner of `ehud-am/vizoalica`)

Because this repository is private, any customer repository that calls this reusable workflow
must first be granted access: `gh api -X PUT repos/ehud-am/vizoalica/actions/permissions/access -f access_level=user`
(repos owned by the same personal account) once per Cloudflare account owner, or the repo can be
made public later with no change to the contract above.

## Backward compatibility

- Adding new optional inputs is non-breaking. Renaming/removing an existing input or a required
  variable/secret name is a breaking change and requires a version bump the customer must
  explicitly adopt (they pin `@v0.5.2` etc.), consistent with how GitHub reusable workflows are
  versioned.
