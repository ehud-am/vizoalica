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

## Contrarian findings and their resolution

Initial review found nine. All were addressed after the first report; the first item is reduced, not eliminated.

1. **Real GitHub Actions / Cloudflare Pages run** — *reduced, not eliminated.* Added `actionlint` (clean), and tests that run the workflow's resolve step and its wrangler-config step as real shell and feed the result into the real Pages config and token functions (config accepted by the browser loader; tokens issued for each listed origin only, refused for others; bundled and separate variables give identical results). A real deploy in the owner's account is still the one thing not done here.
2. **`v0.8.0` did not exist** — *resolved.* The reference is `v0.7.3`, the version being released, and the tag is created with the release.
3. **Default token path changes what "no `data-token-url`" means** — *resolved by disclosure.* Release notes and changelog have an "If you upgrade" note with the `none` opt-out; behaviour on a missing endpoint is tested.
4. **Install check asks for a token** — *resolved by transparency.* A missing/erroring/refusing endpoint can only be told apart by asking it, so the check still does, but the page states it next to the button, docs describe it, the body is never read (tested), and the token is discarded.
5. **Redirecting sites failed the probes** — *resolved.* Probes use manual redirects (never followed); a redirect to another allowed address is fine, to an unallowed one gets its own code `site-redirects` naming the address, and a loop is reported. Six new tests.
6. **Origin edits need a matching change on the site** — *resolved.* The check now probes every allowed address (up to ten) and names the one that is wrong, so a forgotten origin in the token endpoint's list shows up as `origin-not-allowed`; the post-edit message says to update the list.
7. **Project after an environment switch depended on browser storage** — *resolved.* The console also keeps the project in memory across the reload; two tests (storage blocked, project missing in the other environment).
8. **`pnpm vizoalica status` wording** — *resolved* (`vizoalica status`).
9. **No manual screen-reader pass** — *reduced.* Added type-ahead and kept axe and keyboard tests; a screen-reader pass by a person remains a manual step for the owner and cannot be done by an agent.

## Deviations from the plan

See "Implementation notes and deviations" in [tasks.md](tasks.md).

## Recommendation

Ready for human review. Findings 2 to 8 are resolved. Before or right after release, do one real deploy of a test site (finding 1) and a screen-reader pass on the environment menu (finding 9).
