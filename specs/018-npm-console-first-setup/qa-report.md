# QA report: npm console, environments, `deploy`, and `rotate` (v0.7.0)

**Date**: 2026-09-25. **Scope**: branch `018-npm-console-first-setup` against `main` (45 commits, 224 files),
features 018 (npm console, environments) and 019 (`vizoalica deploy`, `vizoalica rotate`).
**Reviewer**: an AI agent acting as a skeptical QA engineer, as the constitution requires before a release. It
was also the implementer of the most recent changes (`env add` questions, `--verbose`, `rotate`, the secrets
hand-over), which is a weakness this report tries to offset by testing the installed package in a real
terminal and against the live Workers rather than only against its own mocks.
**Release decision**: belongs to the human release owner. The agent recommends **GO once the open items
marked "before release" are done**; see the end.

## What was reviewed and how

| Method                          | What it covered                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Gate commands                   | `format:check`, `lint`, `typecheck`, `generate:deploy-workflow:check`, `coverage`, `test:e2e`, `package:build`, `package:check`, `docs:build`, `docs:test`, `pnpm audit --prod` |
| Unit, integration, contract     | 171 test files, 1,504 tests; coverage 94.92% lines, **90.48% branches** (gate: 90%)                                        |
| Browser (Chromium)              | 72 console end-to-end tests including axe in light and dark; 12 docs-site tests; the install page's new help, screenshotted |
| Installed package, real terminal| `npm pack` → `npm install -g` into a scratch prefix → driven in a pseudo-terminal: `--version`, `help`, `env add --verbose` (re-asks, defaults, hidden secret, Ctrl-C), `rotate` end to end against a stand-in Wrangler |
| Live verification (read-only)   | `vizoalica env list` against the real `dev` (workers.dev) and `prod` (custom domain) Workers: both usable               |
| Live operator run               | The release owner's own `vizoalica rotate dev token` against Cloudflare, after the fixes F2 and F3: succeeded           |
| Live website                    | `vizoalica-sample.pages.dev`: token endpoint, token claims, and the Worker's rejection reason (one test event, rejected) |
| Secret handling                 | Tarball contents (19 files), the new real token secret searched for in the repository, working tree, and tarball (absent), settings permissions (`0700`/`0600`) |
| Alignment                       | Code against specs 018/019, the CLI contract, CHANGELOG, v0.7.0 release notes, README, and the deploy guide              |

## Findings

| #   | Severity | Finding | Resolution and evidence |
| --- | -------- | ------- | ----------------------- |
| F1  | High     | **The coverage gate failed (89.91% branches).** The new terminal prompt (`prompt.ts`) had 8.8% branch coverage: it was only checked by hand in a pseudo-terminal. CI runs the same gate, so the branch would not have merged. | `tests/prompt.test.ts` drives it with fake terminal streams: explanation lines, the prompt kept, hidden input with backspace, Ctrl-U, arrow keys, Ctrl-C/Ctrl-D/end of input, and the trace wrapper. `prompt.ts` 94% branches; total 90.48%. The margin over the gate is thin. |
| F2  | High     | **`rotate` and `deploy` could lose a generated secret.** `--secrets-file` was only checked for not existing. A folder that does not exist or cannot be written made the write fail *after* the Worker had the new secret, so the value was shown nowhere and saved nowhere (reproduced: Worker changed, value lost, command threw). The same happened when the environments file could not be updated after an `admin` rotation. | The file's folder is checked before anything changes; a write that still fails shows the secrets instead; a failed `admin` save shows the new administrator secret with the `env update` command to use. Tests for all three, each checking that nothing reached Wrangler or that the value was shown. |
| F3  | High     | **Remembering the Cloudflare account could also lose a secret.** It runs right after the Worker changes; an unwritable settings folder made it throw. Found by the F2 test. | It is a convenience and can no longer fail the command. |
| F4  | High     | **`rotate` refused correctly scoped tokens.** It listed accounts first, which needs Account Settings: Read; rotating needs only Workers Scripts: Edit. Seen in the release owner's real run. | The account comes from `--account`, `CLOUDFLARE_ACCOUNT_ID`, the one remembered at deploy or rotation, a lookup, or a question. Fixed before this cycle (`1126adb`); proven by the owner's successful live rotation. |
| F5  | Medium   | **A Cloudflare 403 ("No access to the specified resource") gave no hint**; the check did not recognize that wording. Seen in the owner's run. | Recognized; the message names the two causes (token lacks Workers Scripts: Edit, or the Worker is in another account) and `--account`. Test uses Cloudflare's wording. |
| F6  | Medium   | **The sample website's events are all rejected (`invalid_signature`).** Its Pages token secret is not the Worker's. Root cause: the deploy printed `VIZOALICA_TOKEN_SECRET` mid-output with no pause, so it was never saved, and the console told people to "generate" the value themselves. | Product side fixed: secrets shown last with a wait for `saved`, the install page says where the value comes from, the "generate" warning corrected, `rotate` added. **Operator side open**: set the rotated value as the site's GitHub secret and redeploy it; then re-check. |
| F7  | Medium   | **Documentation did not match the code**: CHANGELOG and v0.7.0 notes omitted `rotate`, the `env add` questions, `--verbose`, and the secrets hand-over; the CLI contract listed `rotate` as checkout-only; the 019 spec listed rotation as out of scope. | All updated; 019 spec has Stories D4 and D5 and FR-D8. |
| F8  | Low      | "SAVE THIS SECRET" was followed by "they cannot be shown again" and "saved them" for a single secret. | Singular wording; test updated. |
| F9  | Low      | Two `rotate` commands exist in a checkout: `pnpm vizoalica rotate <secret>` (the checkout's own install) and `rotate <environment> <secret>` (environments). They are told apart by the number of words. | Documented in the contract. Acceptable for this release; retire the older one when the checkout install is retired. |
| F10 | Info     | The token endpoint returns the JWT as plain text, not JSON. | Matches the SDK; noted only because a probe assumed JSON. |
| F11 | Medium   | **The public docs led with the old checkout path and had stale claims**: the site's home page said the npm console "asks a few questions the first time" (it shows a welcome page), linked the v0.6.2 notes, and sent "Deploy the backend" to the checkout guide; the quick start led with `pnpm vizoalica backend`; the npm README had no `rotate`, `--verbose`, or the `env add` walk-through; `environments.md` did not describe the questions or the deploy options; troubleshooting had no row for `invalid_signature`, a lost token secret, or either `rotate` failure; a README anchor was broken. | Reviewed README, the npm README, `llms.txt`, and every page on the setup path; all npm-first, checkout guides labelled as such in the sidebar, new troubleshooting rows. The docs contract and site tests updated for the new wording. |
| F12 | Medium   | **Inline code in docs tip boxes failed contrast** (axe, both themes). | Theme fix for all box types; docs-site axe passes. |

## Security notes

- Credentials: the Cloudflare token reaches Wrangler only through its environment or OneCLI, never as an
  argument; `--verbose` traces never contain an answer, a secret, a header, or a body (tests assert this for
  `env add`, `deploy`, and questions; checked by eye in the real-terminal runs).
- Hidden input echoes nothing, restores the terminal on Ctrl-C and end of input (tests F1).
- Secrets files are created `0600`, never overwritten, and refused before any change when they cannot be
  written (F2).
- **gitleaks 8.30.1** (`.gitleaks.toml`): no leaks in the 146 commits of history or in the working tree. CI
  now runs it on every push and pull request (a `secret-scan` job in `ci.yml`, which can also be started by
  hand: `workflow_dispatch`). The owner's new secret appears nowhere in the repository or the package.
- `pnpm audit --prod`: no known vulnerabilities.

## Accessibility

Automated: axe finds nothing serious on any console screen in light and dark, or on any docs-site page in
light and dark; keyboard-only and phone-width/200% zoom scenarios run in the e2e suite. The docs review added a
tip box with inline code, which axe flagged (3.85:1 in light, 4.22:1 in dark); code inside any tip, info,
note, warning, or danger box now uses the body text colour.

**Exception, decided by the release owner on 2026-09-25**: this release relies on automated accessibility
testing only; the manual keyboard and screen-reader pass (task T096) is not done. The constitution asks for
representative manual checks with material interface changes, so this is a recorded, owner-approved
exception, not a pass.

## Open items

| Item | When |
| ---- | ---- |
| T096: manual keyboard and screen-reader pass | Waived by the release owner for 0.7.0 (automated only) |
| gitleaks | Done: no leaks; now in CI |
| Commit and push the pre-release fixes; confirm CI is green (coverage margin is 0.48 points) | Before release |
| Sample website: set the rotated `VIZOALICA_TOKEN_SECRET` in its GitHub repository, redeploy, confirm events are accepted | Before release (it is the deployment validation for websites) |
| T098: roll out to the maintainer's running installation | After release |
| Retire the checkout's one-word `rotate` with the checkout install (F9) | Later |

## Recommendation

GO for v0.7.0 after the remaining "before release" items, at the release owner's decision. Every High finding is
fixed with a test that fails without the fix, the full gate passes, the installed package works in a real
terminal, and both live environments verify.
