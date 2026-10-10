# QA Report: Website Administration Pages and Installation Flow

**Reviewer stance**: a skeptical QA engineer written by the same AI agent that implemented the
change, so treat it as a checklist for the human owner, not independent assurance. The release
go or no-go decision belongs to the human release owner.

**Date**: 2026-09-19 · **Branch**: `013-admin-website-pages` (cut from `012-console-ux-and-geo-insights`; version 0.5.3)

## 1. Gate results

| Gate | Result |
|---|---|
| `pnpm typecheck` | Pass |
| `pnpm lint` | Pass |
| `pnpm format:check` | Pass |
| `pnpm coverage` | 121 files, 758 tests pass. 95.86% lines, 91.83% branches (threshold 90%) |
| `pnpm build` | Pass |
| `pnpm test:e2e` (Playwright, Chromium, mocked API) | 23 pass, including axe on 13 screens in light and dark, and 320px plus 200% zoom on the five website pages |
| `pnpm audit` | No known vulnerabilities |

Baseline before this work (end of spec 012): 118 files, 690 tests; 18 e2e scenarios.

## 2. Requirement evidence

| Requirement | Evidence | Confidence |
|---|---|---|
| FR-001 to FR-003 (list, website page, address) | `website-pages.test.tsx` (cards, no fields, open by address and after reload, not-found for unknown and foreign ids, no Website selector); e2e "list, website, edit, and back" | High |
| FR-004, FR-005, FR-007 (hub content, status, View analytics) | `website-pages.test.tsx`, screenshots in light, dark, phone | High |
| FR-006 (enable, disable, delete) | `website-pages.test.tsx`; e2e keyboard delete that returns focus | High |
| FR-008 to FR-011 (edit page, dirty guard, validation) | `website-pages.test.tsx`, `websites.test.tsx`, `page-primitives.test.tsx`, e2e keyboard-only edit | High |
| FR-012, FR-013 (add page, land on Install) | `website-pages.test.tsx` (other project, same project, 404, interrupted, no project, dirty guard); e2e | High |
| FR-014 to FR-017 (install path choice, default, remembered, one-path line) | `install-page.test.tsx`; e2e keyboard path choice and reload | High |
| FR-018 to FR-021 (steps, settings toggle, paste path, generic loader) | `install-page.test.tsx` counts steps and code blocks per step | High for structure; see R1 for wording |
| FR-022 (Check now) | `install-page.test.tsx`: success, singular, none yet, failed check, unreachable file, snippet path skips reachability, busy state | Medium: see R2, R3 |
| FR-023 to FR-025 (copy, identifiers, one mode, load error) | `install-page.test.tsx`, `page-primitives.test.tsx` | High |
| FR-026, FR-027 (navigation, hint link) | `router.test.tsx`, `scope-shell.test.tsx` | High |
| FR-028 (capabilities, Analytics stays clean) | `area-separation.test.tsx` now asserts a non-zero number of tagged controls per Manage page and none on read-only pages | High |
| FR-029 (accessibility) | axe clean on 13 screens in both themes; keyboard tests; 320px and 200% zoom. It found and led to fixing a real button-contrast failure and a zoom overflow | Medium: automated only, see R6 |
| FR-030 (docs) | README, operator guide, activation guide, SDK guide, CHANGELOG updated | Medium |
| SC-001, SC-002, SC-005 to SC-007, SC-009, SC-010 | Automated (tests and e2e) | High |
| **SC-003, SC-004 (usability sessions)** | **Not measured.** They need five or more first-time testers. | **None** |

## 3. Risks and gaps (be skeptical of these first)

- **R1. The install wording and the path split have not been tried on a real person.** SC-003 and
  SC-004 ("at least 90% choose the right path unaided", "confirm data arrives without leaving the
  page") were not tested. The structure follows the reasoning in `design.md`, but whether people
  understand "GitHub → Cloudflare Pages" versus "Paste a snippet" is unverified. It also assumes
  the Cloudflare Pages workflow is the right recommendation for most sites, which is the project's
  existing guidance rather than something measured.
- **R2. "Check now" reads aggregated data, so it can lag.** New page views can take a short while
  to appear, so a check run seconds after visiting the site can say "No page views yet". The message
  now says to wait a minute or two, but it has not been verified against a real backend how long
  the delay is.
- **R3. "Check now" only proves data reached this website in the last 24 hours.** On a busy project
  it says nothing about consent or about which page sent it. It also cannot tell an old install
  from a new one. It is a finish line, not a diagnosis; Health remains the place for diagnosis.
- **R4. Unsaved-changes protection is partial by design.** It covers the back link and Cancel. The
  browser's back button, a reload, or closing the tab still loses edits silently.
- **R5. Removing Installation from the navigation breaks old links.** `#/manage/installation` now
  falls back to Overview. Docs are updated, but any external bookmark or note would land on the
  wrong page.
- **R6. Accessibility is automated only.** No screen reader pass on the path cards (tab pattern
  with automatic activation) or on the copy announcements. The path cards announce their name and
  description through hidden text; a real reader may read them differently. axe's moderate
  findings were not asserted.
- **R7. The mocked API is not a real backend.** All tests and screenshots use mocks, including the
  installation guidance. The guidance shapes come from the existing contract and its fixtures, but
  nothing was run against the real local API or a real Worker.
- **R8. A global visual change.** `--color-action` makes every filled button a darker blue in the
  light theme (dark theme unchanged in hue). It is a correct contrast fix, but it is visible
  everywhere, not only on these pages.
- **R9. The activation guide link points at `main` on GitHub.** `GUIDE_URL` is hardcoded to the
  repository's `main` branch, so it follows whatever the docs say later, and breaks if the file
  moves.
- **R10. Shipping decision made.** The owner chose to ship this work in 0.5.3. `CHANGELOG.md`
  and `docs/releases/v0.5.3.md` now describe the whole release (the `[Unreleased]` section was
  folded in), and the release notes' validation numbers were updated to this run. The `v0.5.3` git
  tag still does not exist; the customer workflow reference in the installation guidance needs it.
- **R11. Edge behavior worth a manual look.** A website open in two tabs (rename in one, stale
  page in the other), and a very long website name or many origins (card ellipsis, wrapping on
  the website page).
- **R12. Old code left alone.** `getAnalytics`, `AnalyticsSummary.tsx` (from spec 012) are still
  unused.

## 4. Things the owner should know

1. **Committed and pushed on request, not merged or tagged.** The branch is
   `013-admin-website-pages`, created from the pushed `012-console-ux-and-geo-insights`, so it
   contains both pieces of work.
2. **Decisions taken without asking**, recorded in the spec's Assumptions: Installation leaves the
   primary navigation; the list shows no per-website health; unsaved-changes covers in-page
   controls only; GitHub → Cloudflare Pages is the default path.
3. **A docs contract test was edited** (`deployment-docs.contract.test.ts`): its project-first check
   was tied to the old "open Projects, then…" wording and now checks the "Add website" flow.
4. **No real Cloudflare account, backend, or website was touched.**

## 5. What the owner should test

1. Add a real website and follow its Install page end to end on both paths, including Check now on
   a site that is actually sending data (note how long it takes to appear).
2. Have someone who has not seen it choose a path and find the secrets (SC-003, SC-004).
3. Open a website in two tabs and edit in one, then look at the other.
4. Try a website with a very long name and several origins.
5. Screen reader pass on the path cards, the toggle, and the copy buttons.
6. Create the `v0.5.3` tag when you cut the release.
