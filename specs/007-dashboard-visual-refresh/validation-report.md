# Validation report: dashboard visual refresh

All commands below were run against the working tree at the tip of
`codex/007-dashboard-visual-refresh`, package version `0.4.0`, on 2026-09-09.

## Formatting

```
pnpm run format:check
```

Result: **pass.** `All matched files use Prettier code style!` (28 files needed `prettier --write`
first - all touched by this feature's own commits; fixed and re-verified before this report.)

## Linting

```
pnpm run lint
```

Result: **pass.** `eslint .` reported no errors or warnings.

## Type checking

```
pnpm run typecheck
```

Runs `tsc -b --pretty false` (every workspace project reference) followed by a standalone check of
`scripts/verify-website.ts` and the Cloudflare Pages Function example. Result: **pass**, clean
across all 10 workspace projects plus both example files.

## Tests

```
pnpm exec vitest run
```

Result: **pass. 390 tests across 82 files, 0 failures.**

## Coverage

```
pnpm exec vitest run --coverage
```

Result: **pass** against the repository's configured 90%/90% lines/branches thresholds
(`vitest.config.ts`, `coverage.thresholds`):

| Metric     | Result | Threshold |
| ---------- | ------ | --------- |
| Statements | 94.69% | -         |
| Branches   | 90.21% | 90%       |
| Functions  | 94.80% | -         |
| Lines      | 96.66% | 90%       |

Branches started this report's run at 89.31% (just under threshold); three small, genuinely
undertested spots accounted for the gap and were closed with real tests rather than coverage
padding: the Worker's `scheduled()` cron handler had no test at all
(`dashboard-retention.test.ts`), `ThemeToggle.tsx` was only exercised indirectly through `App.tsx`
(`theme-toggle.test.tsx`, 5 cases), and several `time-range.ts`/`config.ts` error branches
(invalid dates, non-HTTPS remote URL, non-loopback console origin, a revoked credential,
`resolvePreferencesPath`'s two branches) had no direct coverage (`time-range.test.ts`,
`config.test.ts`).

## Production builds

```
pnpm run build
```

Result: **pass.** All 9 buildable workspace packages (`event-contracts`, `privacy`, `browser-sdk`,
`ingest-api`, `ingest-worker`, `deploy-cli`, `local-ops-api`, `admin-web`, `token-demo`) built
successfully. `admin-web`'s Vite build additionally confirms the brand-new pieces this feature
depends on: Tailwind's CSS output is present (20.84 kB), the build-time `__VIZOALICA_VERSION__`
constant is literally embedded in the bundle (verified separately - see US4's commit), and the
favicon link resolves in the emitted `index.html`.

## Deployment preflight

```
pnpm run deploy:check
```

Result: **pass.** This machine has an authenticated Cloudflare account and a configured
`deploy/cloudflare/wrangler.production.toml`; `wrangler deploy --dry-run` succeeded, listing the
expected `VIZOALICA_DB` (D1) and `VIZOALICA_EVENTS` (R2) bindings and environment variables, with
no upload errors. (This report intentionally omits the account name/ID and login email that
command printed - that is this operator's real credential, not something that belongs in a
committed file.)

`deploy:apply` (an actual deploy, including applying migration `0005` to the real database) and
`deploy:verify` (a live HTTP check against the deployed Worker) were **not** run for this report -
both are real, side-effecting actions against production infrastructure and require the release
owner's explicit decision to deploy, not something to do silently while assembling validation
evidence. `deploy-cli`'s own test suite (part of the 390 tests above) covers the `apply`/`plan`/
`configure` logic in isolation, including the analytics digest secret's generation, redaction, and
provisioning behavior added by this feature.

## Summary

Every automated gate in this report passes. The two commands intentionally not run
(`deploy:apply`, `deploy:verify`) are deliberate exclusions, not gaps - they perform a real
deployment and are the release owner's call, covered further in
[release-readiness.md](./release-readiness.md).
