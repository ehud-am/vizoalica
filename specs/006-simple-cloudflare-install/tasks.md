# Tasks: Simple Cloudflare installation

## Phase 1: Setup

- [x] T001 Review all 18 findings and preserve existing edits in specs/006-simple-cloudflare-install/research.md.

## Phase 2: Foundations

- [x] T002 Define installation and security contracts in specs/006-simple-cloudflare-install/contracts/installation.md.

## Phase 3: US1 — Install without guesswork

Independent test: compile standalone SDK/Pages Function and rehearse the ordered guide and SQL locally.

- [x] T003 [US1] Add Pages token contract tests in apps/token-demo/tests/pages-token.test.ts.
- [x] T004 [US1] Add standalone build command in scripts/build-browser-sdk.mjs and package.json.
- [x] T005 [US1] Add scoped token Function and consent-aware demo in examples/cloudflare-pages/.
- [x] T006 [US1] Rewrite ordered installation in docs/operations/cloudflare.md and add docs/operations/pages.md.
- [x] T007 [US1] Simplify README.md and align docs/operations/browser-sdk.md.

## Phase 4: US2 — Isolated credentials

Independent test: provider environment/timeout assertions and same-origin negative tests pass.

- [x] T008 [US2] Add provider regression cases in apps/deploy-cli/tests/contract/onecli-provider.contract.test.ts.
- [x] T009 [US2] Correct wrapped Wrangler initialization and operation timeouts in apps/deploy-cli/src/providers/.
- [x] T010 [US2] Verify and extend provenance tests in apps/local-ops-api/tests/security.test.ts.
- [x] T011 [US2] Document exact vault fields, gateway and explicit recovery in docs/operations/local-analytics.md.

## Phase 5: US3 — Verify and recover

Independent test: reject false-success responses and validate generated snippet configuration.

- [x] T012 [US3] Test complete and escaped snippets in apps/local-ops-api/tests/snippet.test.ts.
- [x] T013 [US3] Generate complete snippets in apps/local-ops-api/src/routes/snippet.ts and remove misleading fallback in apps/admin-web/src/components/IntegrationSnippet.tsx.
- [x] T014 [US3] Add content-aware verification in scripts/verify-website.ts and tests in apps/token-demo/tests/website-verification.test.ts.
- [x] T015 [US3] Map all 18 findings and recovery actions in docs/operations/troubleshooting.md.

## Phase 6: Polish

- [x] T016 Update patch 0.3.1 in package.json and CHANGELOG.md; align deployment references.
- [x] T017 Run formatting, lint, types, tests, build, coverage, dependency audit and local example rehearsal; record in specs/006-simple-cloudflare-install/validation.md.
- [x] T018 Review documentation links, command sequence, security/cost and all issue dispositions; write specs/006-simple-cloudflare-install/qa.md and complete tasks.md.

## Dependencies and parallel opportunities

Setup → Foundations → US1 → US2 → US3 → Polish. Tests precede implementation. US1 docs and static example markup can be reviewed independently after contract tests. US2 vault documentation and provider tests can be reviewed independently. US3 verifier and snippet tests affect separate files. Execute locally in sequence; no additional implementation agents are needed.

## Implementation strategy

Deliver US1 as the smallest useful installation path, then add isolated-credential fixes and verification. Complete all three stories and local validation in this patch. Live deployment is an operator validation step, not a prerequisite for publishing improved instructions.
