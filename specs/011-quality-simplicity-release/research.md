# Phase 0 Research: Quality and Simplicity Patch Release — Phase 1 (Deployment)

## Unknown 1: How does a customer's CI/CD run set Cloudflare Pages environment vars/secrets
without ever committing them to the customer's repo?

**Decision**: The reusable workflow generates an ephemeral `wrangler.toml` in the CI runner's
workspace at run time (interpolating GitHub Actions variables into the `[vars]` block), uses it
for `wrangler pages deploy`, and discards it at the end of the job — it is never committed. The
one true secret needed at runtime by the ingest-token function (`VIZOALICA_TOKEN_SECRET`) is set
via `wrangler pages secret put` (Cloudflare's encrypted Pages secret store), which persists on the
Cloudflare side across deploys and does not need to be re-set on every run if unchanged (guard:
attempt `secret put` only if the value differs, or always set it idempotently since it's cheap and
the secret itself is a GitHub Actions secret rather than a file).

**Rationale**: Cloudflare Pages does not currently expose a "one-shot inline vars" flag on
`wrangler pages deploy` — non-secret vars are ordinarily configured either via the Cloudflare
dashboard, the Cloudflare API, or a `wrangler.toml`'s `[vars]` block picked up at deploy time. Of
these, a CI-generated, git-ignored `wrangler.toml` is the simplest to implement, is fully
transparent (visible in the workflow's own logs), requires no extra Cloudflare API calls beyond
what `wrangler` already makes, and trivially satisfies "never committed to the customer's source"
since the file is created and destroyed entirely inside the ephemeral CI job.

**Alternatives considered**:
- *Direct Cloudflare API calls to PATCH the Pages project's `deployment_configs`*: more
  "correct" in the sense of not depending on a generated file, but adds a second API surface to
  maintain, duplicate error handling, and doesn't match this project's existing pattern (all
  other deploy code already shells out to `wrangler`, per `apps/deploy-cli/src/providers/*`).
  Rejected for now as unnecessary complexity; revisit only if `wrangler pages deploy` ever
  supports inline var injection natively.
- *Requiring the customer to commit a `wrangler.toml` with `REPLACE_` placeholders (today's
  pattern) and `sed`-substitute it in CI*: this is exactly the mechanism the user asked to
  eliminate — it still puts a values-shaped file in the customer's source, just with placeholder
  text, and invites accidental commits of real values. Rejected.

## Unknown 2: How do the versioned Pages Functions (`config.json.ts`, `ingest-token.ts`) and the
loader script reach a customer repo without the customer hand-copying source?

**Decision (revised after live testing)**: The original design added a second `actions/checkout`
step to check out `ehud-am/vizoalica` from inside the customer's job. Testing against a real
customer repo (`ehud-am/vizoalica-sample`) proved this does not work: `actions/checkout`'s default
`GITHUB_TOKEN` never carries cross-repo access to a private source repository from within a
reusable workflow's job, even after granting `access_level: user` for the reusable-workflow call
itself (that setting only governs which repos may *resolve* the `workflow_call`, it does not grant
`actions/checkout` read access to the called repo's contents). The actual implementation instead
embeds the three files' content, base64-encoded, directly inside `deploy-vizoalica-pages.yml`
itself (which the caller's job already has, since `workflow_call` resolution succeeded), decoded
by a `run:` step. `scripts/generate-deploy-workflow.mjs` regenerates that embedded block from the
real source files under `examples/cloudflare-pages/`, and CI (`pnpm run
generate:deploy-workflow:check`) fails the build if they drift apart.

**Rationale**: Works today without requiring `ehud-am/vizoalica` to be public and without handing
customers a second credential just to read three small files. The generator + CI check keeps a
single source of truth despite the duplication, at the cost of a slightly larger workflow file.

**Alternatives considered**:
- *Publish `functions/vizoalica/*` and the loader as an npm package customers `npm install`*:
  more idiomatic for a JS ecosystem, but adds packaging/publish/versioning overhead disproportionate
  to two small files, and customer repos may not use npm at all (a plain static site has no
  `package.json`). Rejected for this release; can be revisited later without changing the
  workflow's external contract.
- *Fetch the files via pinned `raw.githubusercontent.com` URLs at deploy time*: works only if the
  repo is public (raw.githubusercontent.com does not serve private-repo content without a token
  either), so it doesn't solve the actual problem while adding a mid-job network dependency.
  Rejected.
- *Have the customer supply a fine-grained PAT scoped to read `ehud-am/vizoalica`, passed to
  `actions/checkout`'s `token:` input*: would work, but forces every customer to mint and rotate
  an extra credential just to read three small, non-secret files. Rejected as disproportionate;
  revisit only if the embedded-file approach becomes unwieldy (e.g., if the vendored surface grows
  much larger).
- *Make `ehud-am/vizoalica` public*: would also solve this (and the reusable-workflow resolution
  problem) with no workflow changes at all, and is the project's long-term direction per the
  constitution's open-source principle — but the user does not want that dependency at this stage,
  so the embedded-file approach stands independent of the repo's visibility.

## Unknown 3: What is the minimum Cloudflare API token scope the workflow needs?

**Decision**: Document (in Phase 1) and enforce (in Phase 4, Cloudflare-hardening review) that the
`CF_API_TOKEN` a customer creates for this workflow needs exactly: Cloudflare Pages — Edit, scoped
to the specific account. It does not need Workers scripts, DNS, zone, or account-wide admin
access. Phase 1 ships the workflow with documentation stating this scope explicitly; Phase 4 is
where this gets verified against the real Cloudflare token-scoping UI/API as a hardening check.

**Rationale**: Principle II/IV of the constitution require least-privilege credentials; getting
the documented scope right from the start avoids customers over-provisioning a token on day one.

## Unknown 4: How does the admin console learn a website's most recent CI/CD deployment status
(FR-007) without duplicating GitHub Actions' own state?

**Decision**: The console does not attempt to poll GitHub Actions on the customer's behalf (it
has no standing credential to the customer's GitHub repo). Instead, Phase 1 scopes FR-007 down to
what vizoalica *can* observe directly: whether the deployed website's `/vizoalica/config.json`
endpoint is currently responding with valid configuration (a live reachability/health check the
console already has the network path to perform), shown as "Website reachable" /
"Website unreachable or misconfigured" with a timestamp. This is an honest signal instead of a
fabricated integration with a system vizoalica doesn't have access to.

**Rationale**: Avoids inventing a GitHub App / OAuth integration (large scope increase, out of
proportion to a patch release) while still directly addressing the "no deploy feedback" complaint
— the console now tells the operator whether their website's dynamic config endpoint is actually
live, which is the outcome that matters to them, rather than a GitHub-specific run status.

**Alternatives considered**:
- *GitHub App/OAuth integration to read Actions run status*: rejected as disproportionate scope
  for this release; noted as a possible future enhancement, not a requirement here.
