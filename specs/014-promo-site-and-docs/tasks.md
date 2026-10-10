---

description: "Task list for console polish, promo assets, and the docs site"
---

# Tasks: Console Polish, Promo Assets, and the vizoalica.dev Docs Site

Do not commit or push unless asked. Do not touch Cloudflare.

## Phase 1: Console (US1)

- [X] T001 Remove the Local workspace indicator, its component, and its styles; move the explanation into the operator docs
- [X] T002 Fix the range picker label layout (scope the scope-bar label style; radio then label on one line) with unit, CSS, and e2e checks

## Phase 2: Snapshots and video (US2, US3)

- [X] T003 `scripts/promo/demo-console.ts`: fictional, deterministic demo data and API mock
- [X] T004 `scripts/promo/capture-snapshots.ts` and `pnpm promo:snapshots`: six images into `docs/assets/promo-src/`
- [X] T005 `scripts/promo/video/index.html` and `render-video.ts` and `pnpm promo:video`: typewriter clip with the official logo, MP4, WebM, poster
- [X] T006 Review the images and frames visually; adjust

## Phase 3: Docs site (US4)

- [X] T007 Workspace package `docs/package.json`, VitePress config, theme (brand colors, hero video component), `.gitignore`, scripts
- [X] T008 Home, get-started, and tour pages; sidebar covering every existing doc; GitHub-link rewrite for outside files
- [X] T009 Public files: brand copies, favicon, media, `_headers`, `robots.txt`, sitemap, `llms.txt` generation
- [X] T010 Tests: docs structure (every doc in navigation, brand copies equal, workflow rules), Playwright site checks (axe light and dark, no third-party requests, reduced motion, phone width, no-JS reading)

## Phase 4: Pipeline (US5)

- [X] T011 `.github/workflows/docs-site.yml` (build and check on PR; deploy on main when configured), actionlint-clean
- [X] T012 `docs/operations/docs-site.md` maintainer guide (setup, verify, rollback, removal, cost)

## Phase 5: Wrap-up

- [X] T013 README and docs index link to the site; README screenshot uses the new snapshot; CHANGELOG
- [X] T014 Gates (typecheck, lint, format, tests, coverage, build, e2e, docs build and checks, audit) and `qa-report.md`

## Implementation notes (deviations from the plan)

- The site's inline styles are allowed by the Content-Security-Policy (`style-src 'self' 'unsafe-inline'`)
  because the theme applies style attributes when the page loads; scripts stay limited to the site
  and three hashed inline scripts. The check that found this is `docs/tests/site.spec.ts`.
- Syntax highlighting uses the high-contrast themes, because the default themes had tokens just under
  4.5:1. The sidebar's "Release notes" group is not collapsible (the theme's collapsible groups nest a
  button in a button and fail the accessibility check).
- `pnpm.overrides` pins `vitepress>vite` to `^6.4.3`: VitePress 1.6.4 pulled a Vite 5 with advisories
  (dev-server, mostly Windows) and no 5.x patch. Remove the override when VitePress moves to a patched
  Vite.
- The pipeline builds twice (build job, then publish job) instead of passing an artifact, so no
  unpinned artifact action is needed and the publish job builds from the exact commit.
- Secrets and variables: one secret (`CF_DOCS_API_TOKEN`) and two variables (`CF_ACCOUNT_ID`,
  `VIZOALICA_DOCS_PAGES_PROJECT`), instead of the "two secrets and one variable" first sketched.
- `scripts/capture-console-screenshot.ts` (the README screenshot) was stale after the console
  redesign; it now waits for the Overview heading and reports "No earlier data to compare", which is
  what a fresh install shows.
- The folder is `docs/assets/promo-src/` (the request said "promot-src"; taken to be a typo).

