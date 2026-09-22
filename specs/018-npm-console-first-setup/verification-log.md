# Verification log: 018 install from npm and a console-first setup

## Baseline

Recorded 2026-09-21 on branch `018-npm-console-first-setup` before any implementation change.

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: pass.
- `pnpm coverage`: statements 96.46%, branches 92.21%, lines 97.7% (thresholds: lines and branches 90%).

## Footer link check (T015)

`curl -I -L` on 2026-09-21: `vizoalica.dev`, `/get-started`, `/operations/privacy`, the repository, Issues, Releases, and `blob/main/LICENSE` all answer 200.
`/discussions` initially answered 404 because GitHub Discussions was switched off for the repository (`has_discussions: false`). Turned it on the
same day with `gh api -X PATCH repos/ehud-am/vizoalica -f has_discussions=true`; `/discussions` now answers 200, and the footer includes it.

## Slice 1 gates (0.6.3), 2026-09-21

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: pass.
- `pnpm coverage`: 155 files, 1329 tests pass. Statements 96.7%, branches 92.69%, lines 97.82% (baseline 96.46 / 92.21 / 97.7).
  `apps/cli/src/bin.ts` is excluded like the other entry files; `scripts/check-package.mjs` runs the real command.
- `pnpm test:e2e`: 63 Playwright tests pass (footer, first run, journey, plus the existing suites, with axe in both themes).
- `pnpm package:build && pnpm package:check`: pass. The tarball holds only the allowlist (16 files, about 1.0 MB unpacked, 299 kB packed), nothing looks like a
  secret or local path, it installs into an empty prefix and home, `--version` matches, the console starts and serves the page, its security
  headers, its script, a session, `needsFirstRun: true`, both SDK files, refuses four traversal forms and a write to a page, writes no
  credential, and one interrupt stops it with exit code 0.
- `pnpm docs:build` and the deploy-cli and docs contract tests: pass.

## Quickstart, sections 1 to 4 and 8 (slice 1 parts)

1. Gates: pass (above).
2. Package from a clean prefix: pass, through `pnpm package:check`.
3. Footer: `e2e/footer.spec.ts` (13 tests) passes: present on Overview, Manage, and the connection-error screen; single column at 320 px;
   no horizontal overflow at 320, 768, and 1440 px in light and dark; axe clean; all nine links (including Discussions) reachable by
   keyboard with a visible focus ring; no request outside the console.
4. First run and journey: `e2e/first-run.spec.ts` and `e2e/journey.spec.ts` pass, and the jsdom suites (`first-run`, `journey`,
   `availability`, `setup-experience`) pass: at most three questions per path, every unavailable control is `aria-disabled` with a reason
   and sends nothing (including on Enter in a form), a stopped backend shows a notice and blocked stages, and the journey hides at data.
8. Existing setups: `apps/cli/tests/existing-setup.test.ts` passes for a file-mode file written by the checkout `connect`, a OneCLI
   placeholder file (never written back as a secret), a file others can read, a damaged file, and a revoked file.

Deviations from the plan, all in slice 1:

- The published folder is `apps/cli/package/` (not `apps/cli/dist/`), so that the tarball's own `dist/` holds the bundle, console, SDK files,
  and schema as the contract lists them.
- The footer omits npm (not published yet); Discussions was enabled on the repository and is included; see above.
- From the package, commands other than `console`, `serve`, `help`, and `--version` print where to go and exit 2. They still work in a
  checkout. The console's first-run "I need a backend" step tells the user deploying from the console comes next and links the guide.

`npm publish --dry-run --provenance=false` from `apps/cli/package/` on 2026-09-21 lists the same 16 files as `vizoalica@0.6.2`; `npm view vizoalica`
still answers 404, so the name is free. Nothing was published.
