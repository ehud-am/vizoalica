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
`VIZOALICA_SITE_ORIGIN`, `CF_ACCOUNT_ID`, `CF_PAGES_PROJECT`.

## Required repository secrets (`secrets:`, via repo Settings → Secrets)

`CF_API_TOKEN` (Cloudflare Pages:Edit scope), `VIZOALICA_TOKEN_SECRET` (≥32 random chars).

## Behavior contract

1. On trigger, checks out the caller's repo and this project's repo at the pinned ref.
2. Validates every required variable/secret is present and non-empty; on any missing/malformed
   value, fails the job with a message naming exactly which one, before any deploy action runs
   (FR-004). No partial or insecure deploy is attempted.
3. Copies `functions/vizoalica/{config.json.ts,ingest-token.ts}` and `vizoalica-loader.js` from
   this project's pinned ref into the caller's build output under `site-directory`.
4. Generates an ephemeral `wrangler.toml` (not committed, exists only in the job's workspace)
   populating `[vars]` from the required variables above.
5. Runs `wrangler pages secret put VIZOALICA_TOKEN_SECRET` against the target Pages project
   (idempotent) using `CF_API_TOKEN`/`CF_ACCOUNT_ID`.
6. Runs `wrangler pages deploy <site-directory> --project-name <CF_PAGES_PROJECT>`.
7. On success, the job output includes the deployed URL. On failure at any step, the job fails
   with the underlying `wrangler`/Cloudflare error surfaced, not swallowed.

## Backward compatibility

- Adding new optional inputs is non-breaking. Renaming/removing an existing input or a required
  variable/secret name is a breaking change and requires a version bump the customer must
  explicitly adopt (they pin `@v0.5.2` etc.), consistent with how GitHub reusable workflows are
  versioned.
