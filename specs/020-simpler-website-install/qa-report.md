# QA report: Simpler Website Management and Install

**Date**: 2026-09-25 · **Branch**: `020-simpler-website-install` · **Reviewer**: AI agent (skeptical QA stance). The release owner decides go/no-go.

## Results

| Check | Result |
|-------|--------|
| `prettier --check .` | pass |
| `pnpm lint` | pass |
| `pnpm typecheck` | pass |
| `pnpm vitest run --coverage` | 175 files, 1614 tests pass; lines 95.03%, branches 90.73% (gate: 90%) |
| Playwright (`apps/admin-web`) | 77 pass, including axe in light and dark, 320 px, 200% zoom |
| `generate:deploy-workflow:check` | up to date |
| `pnpm package:build` + `package:check` | package ready to publish |
| Workflow configuration step, run as real shell (13 tests) | pass, including injection and metacharacter refusals |

Measured against the spec: SC-001 (embed copies 2 values: endpoint and source key), SC-002 (5 values), SC-005 (all 20 common address forms normalise), SC-006 (six install codes each tested with one next action), SC-007 (old tag, old workflow variables and old config document tested to still work), SC-009 and SC-010 (header and footer overlap checks at 320/768/1280), SC-011, SC-012 (nav has 9 items for an administrator: 7 Analytics + Websites + Health), SC-013.

## Contrarian findings

1. **Not run against a real GitHub Actions job or a real Cloudflare Pages deploy.** The workflow's resolve step is proven as shell and the YAML parses, but the end-to-end deploy path was not exercised. Do this once before release.
2. **`v0.7.3` does not exist.** The starter workflow the console now shows points at it. Until it is tagged, following the guidance fails at the `uses:` line. Tag and release together.
3. **Default token path changes what "no `data-token-url`" means.** It used to mean unsigned. An old tag that relied on the absence now asks `/vizoalica/ingest-token`; if that 404s it still sends unsigned, so nothing breaks, but the signed session it never had is not created. Tested; documented as `data-token-url="none"`.
4. **The install check asks the customer's token endpoint for a token** (with the site's own `Origin`) and discards it. It never reads the body or stores it, and the token expires in five minutes, but it is a real request that the operator did not type. Worth an explicit release-owner nod.
5. **Redirecting sites** (apex to `www`) fail the probes because redirects are refused to keep the request from being steered; the message says so and tells the person to allow the other address.
6. **Origin edits need a matching change on the site** (the token endpoint's own origin list). The console now says so; it cannot check it.
7. **The environment change relies on the remembered project** (browser storage) to keep or replace the project; with storage blocked the first project is chosen. Acceptable, but it is per browser.
8. **Old wording left alone**: `nextStep` in Health still says `pnpm vizoalica status`; not part of this change.
9. **Accessibility**: automated axe passes and keyboard behaviour is tested for the menu, but no manual screen-reader pass was done here; do one on the environment menu.

## Deviations from the plan

See "Implementation notes and deviations" in [tasks.md](tasks.md).

## Recommendation

Ready for human review. Do not release before findings 1, 2 and 4 are resolved.
