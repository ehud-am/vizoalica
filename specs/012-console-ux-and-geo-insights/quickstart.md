# Quickstart: Validating Console UX and Geography

Nothing here touches a real Cloudflare account. Automated checks use mocks, and manual checks use
the console's local development server against a mocked API.

## Prerequisites

- Node.js 22, pnpm 9 (`pnpm install` already done)
- On branch `012-console-ux-and-geo-insights`

## 1. Automated gates

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test            # unit, component, contract tests
pnpm coverage        # must stay above 90% lines and branches
pnpm admin-web:build
pnpm test:e2e        # Playwright + axe, mocked API
```

Expected: all pass, with zero serious or critical accessibility violations.

## 2. Regenerate reference data (only when changing sources)

```sh
node scripts/generate-world-geo.mjs
git diff --stat apps/admin-web/src/geo
```

Expected: no diff when inputs are unchanged.

## 3. Manual pre-release walkthrough (mocked API, dev server)

```sh
pnpm admin-web:dev
```

Then verify, in light and dark themes, at desktop and phone width, and with keyboard only:

| Check | Expected (spec ref) |
|---|---|
| Navigation | Two groups, Analytics and Manage (US1) |
| Analytics screens | No create, edit, disable, or delete controls (FR-003) |
| Scope | One project and website control in the shell; change persists across screens and reload (US2) |
| No project | Every Analytics screen explains and links to create one (FR-009) |
| Overview | Page views and unique users with previous-period change above the fold (FR-011) |
| Geography | Full country names, world map with legend, all countries in the table, continent totals, Tor and unknown labelled (US3) |
| Data views | Bars instead of pies, table toggle, "Show all" on long lists (FR-013 to FR-015) |
| Reload state | Changing range keeps headings and layout; no stale numbers (FR-016) |
| First run | Website with no events shows a waiting state linking to installation (FR-017) |
| Manage | Projects, Websites, Installation, Health are separate; danger zones separated; confirmation dialog names the target (US5) |
| Network | Browser dev tools show requests only to the local console (SC-009) |

## 4. Against a real deployment (owner only, after a Worker redeploy)

Full country lists need the updated Worker (`pnpm worker:deploy`). Before that, the console shows
at most ten countries plus "Other", which is expected and safe. Use the rehearsal worktree recipe
from your notes for from-scratch installs; do not run destructive git commands in the main
checkout.
