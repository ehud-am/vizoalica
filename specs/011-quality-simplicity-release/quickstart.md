# Quickstart: Validate the Phase 1 Deployment CI/CD Path

## Prerequisites

- A Cloudflare account with a Pages project created for the test site (or let the workflow assume
  it exists — Pages project creation itself stays a one-time manual/console step, not automated
  by this workflow, consistent with the constitution's "MUST NOT silently create resources").
- `CF_API_TOKEN` (Pages:Edit scope) and `CF_ACCOUNT_ID` available.
- A dedicated vizoalica sample/test website repository, kept separate from any unrelated product's
  repository (e.g. `ehud-am/vizoalica-sample`), so vizoalica's own testing never cross-references
  another initiative's repo or Cloudflare resources.
- Local `wrangler` (`pnpm exec wrangler --version`) and `gh` (`gh auth status`) already
  authenticated, as confirmed available in this environment.

## Setup

1. In the test repo, add the required repository variables and secrets listed in
   [contracts/deploy-workflow-contract.md](./contracts/deploy-workflow-contract.md), via
   `gh variable set NAME --body VALUE --repo <owner>/<repo>` and
   `gh secret set NAME --body VALUE --repo <owner>/<repo>`.
2. Add the caller workflow file shown in the contract to
   `.github/workflows/deploy-website.yml` in the test repo, pointing `uses:` at this project's
   pinned ref.
3. Push a change to the configured `site-directory`.

## Validation

1. `gh run watch --repo <owner>/<repo>` (or check the Actions tab) — confirm the job succeeds and
   its final step reports the deployed URL.
2. `curl https://<deployed-url>/vizoalica/config.json` — expect HTTP 200 with a JSON body
   containing `data-source`/`data-project`/etc. matching the GitHub Actions variables configured,
   not any placeholder or hardcoded value.
3. `grep -r "VIZOALICA_" <test-repo-checkout>` (excluding `.github/workflows`) — expect zero
   matches of a real (non-placeholder) value anywhere in the committed source, confirming FR-003.
4. From the vizoalica admin console, open the corresponding website's page — confirm it shows
   "Website reachable" with a recent timestamp (data-model.md's `configEndpointReachable`).
5. Time the whole sequence from prerequisite-complete to step 4 passing — must be ≤5 minutes
   (SC-001), for the website leg of the overall backend+operator+website budget.
6. Regression check: an existing static-integration website (unchanged) still renders its
   hardcoded snippet and collects events normally (FR-005).

## Expected failure-path check

- Temporarily remove one required repository variable (e.g. `VIZOALICA_PROJECT_ID`) and re-run
  the workflow — expect the job to fail fast with a message naming that variable, and confirm no
  deploy occurred (`wrangler pages deployment list` shows no new deployment from this run).
