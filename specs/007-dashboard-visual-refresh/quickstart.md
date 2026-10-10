# Quickstart: Dashboard Visual Refresh

This guide is the implementation and review path for feature `007-dashboard-visual-refresh`. Commands run from the repository root unless stated otherwise.

## 1. Prepare the workspace

```bash
corepack enable
pnpm install
pnpm validate
```

Expected result: the existing baseline passes before feature work begins.

The feature adds only these external UI packages:

- `tailwindcss` and `@tailwindcss/vite` as admin-web build dependencies.
- `recharts` as the admin-web chart dependency.

Request classification remains source-owned and dependency-free.

## 2. Apply the local D1 migration

After `deploy/cloudflare/migrations/0005_dashboard_visual_refresh.sql` exists, apply all migrations to the local D1 database with the repository's normal Wrangler configuration:

```bash
pnpm exec wrangler d1 migrations apply vizoalica-config --local --config deploy/cloudflare/wrangler.toml
pnpm exec wrangler d1 migrations list vizoalica-config --local --config deploy/cloudflare/wrangler.toml
```

Expected result: the list shows every migration through `0005_dashboard_visual_refresh.sql`. Never copy old hourly rows into the new minute tables and never backfill the dashboard by scanning R2.

For a deployed environment, use the repository's plan/apply workflow and verify the live D1 name and ID before applying remote migrations:

```bash
pnpm run deploy:plan
pnpm run deploy:apply
pnpm run deploy:verify
```

The deployment plan must include a generated Worker-only `VIZOALICA_ANALYTICS_DIGEST_SECRET`. It is separate from the JWT token secret, never reaches the local console or website, and requires no paid service.

## 3. Start the existing local console pair

Use the existing protected configuration file under `~/.config/vizoalica/`:

```bash
pnpm run local-ops-api:dev -- ~/.config/vizoalica/local-operations.json
pnpm run admin-web:dev
```

Open `http://127.0.0.1:5173`. The local API remains bound to loopback and the browser receives only an HttpOnly local session cookie, never the Worker administrator credential.

An explicit theme selection is stored separately at:

```text
~/.config/vizoalica/preferences.json
```

The file must be mode `0600`. Deleting it restores system-theme behavior at the next start without affecting `local-operations.json`.

## 4. Verify the dashboard manually

Use at least two websites with known page-view fixtures.

1. Open Overview and confirm `All websites` is selected.
2. Confirm page views, unique users, the trend, top page paths, countries, user agents, referrers, OS, browser, device, and traffic widgets all show the same scope and range.
3. Select one website and confirm every widget changes together; no old all-sites value remains labeled current.
4. Apply Last 6 hours, Last 12 hours, Last 24 hours, Last 7 days, and Last 30 days.
5. Open Custom range, enter minute-granular local start/end values, and confirm the timezone is visible.
6. Verify reversed, equal, future, unaligned API, and longer-than-30-day ranges are rejected before a query.
7. Dismiss an edited range without Apply and confirm the active dashboard does not change.
8. Confirm an empty range shows explicit zero/empty states and a pre-migration range shows an incomplete notice.
9. Confirm a shared reviewed project pseudonym deduplicates across two sources, while unrelated source-local identifiers remain separate.

The range sent to the API must use one captured complete-minute end and exact UTC `[start,end)` boundaries. The browser displays those instants in the operator's local timezone.

## 5. Verify theme, brand, and responsive behavior

1. With no `preferences.json`, switch the operating system between light and dark and confirm the console follows it.
2. Choose Light, reload, and restart the local API; confirm Light persists.
3. Choose Dark and repeat.
4. Make the preference directory temporarily unwritable in a test fixture; confirm the current session changes theme, a nonblocking error appears, and analytics still works.
5. Verify the header lockup, square mark, monochrome mark, and favicon against `docs/brand.md` at their documented minimum sizes.
6. Confirm every main page footer reads `2026 | Vizoalica | v0.x.y` and that the version matches root `package.json`.
7. Review both themes at 320 CSS pixels wide and at 200% zoom. There must be no page-level horizontal scroll.
8. Use the keyboard only: open and dismiss the range popover, move through radios and inputs, apply a range, change scope, switch theme, and confirm visible focus and focus return.
9. With a screen reader, confirm charts have captions and the same values are available in tables/lists without relying on hover or color.
10. Enable reduced motion and confirm chart transitions are disabled.

## 6. Verify privacy and authorization

Automated tests must prove all of the following:

- Spoofed `CF-IPCountry` is ignored; only trusted `request.cf.country` is used.
- Missing, malformed, `XX`, and `T1` country inputs map to documented values.
- Empty, oversized, malformed, and ambiguous user agents never escape normalization.
- Raw UA, IP, bot score/fingerprints, visitor IDs, event IDs, and HMAC digests are absent from R2 additions, D1 dimension rows, logs, errors, and API responses.
- Bot evidence takes precedence over a human-looking browser; uncertain traffic is Unknown.
- A website outside the project and a deleted website return no analytics.
- Missing/expired admin or local sessions fail closed.
- Preference endpoints enforce loopback host, exact same-origin provenance, session authentication, allowlisted JSON, atomic writes, and `0600` permissions.

## 7. Verify bounded queries and cost

Seed a representative 30-day fixture at the configured quota and inspect every all-sites and one-site query:

```bash
pnpm test -- --run apps/ingest-worker/tests/dashboard-analytics.integration.test.ts
```

The test must assert:

- `EXPLAIN QUERY PLAN` reports indexed searches on project/source, dimension kind, and minute range rather than a full aggregate-table scan.
- Trend output has at most 720 hourly points or 30 daily points.
- Each ranking has at most ten entries plus a remainder count.
- Duplicate event IDs increment no metric twice.
- Rows older than 32 days are removed by the scheduled cleanup handler.
- The 30-day project response meets the plan's 2-second p95 target in the representative fixture.

D1 charges for table and index rows written. Record `meta.rows_read` and `meta.rows_written` from the fixture and document the observed per-page-view cost before release. The expected shape is one idempotency insert, one total update, up to eight dimension updates, and one visitor-presence insert before index maintenance, with repeated values coalesced inside each accepted batch.

## 8. Run the release checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm coverage
pnpm build
pnpm run deploy:check
```

Coverage must remain above 90% for lines and branches. Before the release owner decides whether to ship, also complete:

1. Cross-artifact alignment review of specification, plan, tasks, contracts, code, README, and deployment docs.
2. Full automated test cycle and dependency/security scan.
3. Written contrarian QA review that actively tests privacy, authorization, stale-data, range-boundary, theme-failure, accessibility, and cost claims.
4. Human release-owner review of the resulting evidence.
