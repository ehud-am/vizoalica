# Implementation Plan: Website Administration Pages and Installation Flow

**Branch**: `013-admin-website-pages` | **Date**: 2026-09-19 | **Spec**: [spec.md](./spec.md) | **Design**: [design.md](./design.md)

## Summary

Split the Websites screen into a list, a page per website, and separate add and edit pages, and
rebuild the installation guidance as a path choice over numbered steps with a "Check now" finish
line. This is a console-only change: routes gain a website parameter, the scope provider learns
when the website list has loaded, and the installation component is replaced. No Worker, local API,
schema, or data change.

## Technical Context

**Language/Version**: TypeScript 5.7, React 19, Node.js 22

**Primary Dependencies**: existing only (React, Vite, Recharts for the trend). No new dependency.

**Storage**: none. The remembered installation path uses guarded browser storage (per-viewer
convenience only).

**Testing**: Vitest + Testing Library (jsdom), Playwright + axe (Chromium). Coverage stays above 90%
lines and branches.

**Target Platform**: local operator console, current evergreen browsers.

**Constraints**: no new requests beyond existing read-only endpoints; no third-party requests;
WCAG 2.2 AA; keyboard operable; 320px and 200% zoom without horizontal page scroll; Analytics keeps
zero state-changing controls; must not touch a real Cloudflare account.

**Scale/Scope**: 5 new pages (list, website, edit, add, install), 1 removed navigation item.

## Constitution Check

| Principle / rule | Assessment |
|---|---|
| I. Privacy-minimal | Pass. No new data. "Check now" reads existing aggregates for one website. |
| II. Security | Pass. No new interface. Copy text never includes secrets (unchanged); secrets are named, never shown. Destructive actions keep named confirmation. New pages are read-only or use existing capability-tagged actions. |
| III. Open source, portable | Pass. Both installation options remain, including the generic loader for other hosts. |
| IV. Minimal infrastructure | Pass. Presentation only. |
| V. Readable engineering | Pass. Spec, design record, and contract precede code. Small components with one job. |
| Accessible experience | Pass by design: tab-pattern path choice, focus management on new pages, dirty-form dialog, announced copy state, axe on every new page. |
| Release gates | Pass. Alignment review, QA report, and go/no-go stay with the human owner. |

No violations. Complexity Tracking not needed.

## Source Code

```text
apps/admin-web/src/
├── router.ts                        # routes gain :id; NAV_ROUTES; hrefFor(path, id)
├── scope/ScopeProvider.tsx          # + websitesLoading
├── shell/
│   ├── AreaNav.tsx                  # nav from NAV_ROUTES; website routes mark Websites
│   ├── ScopeBar.tsx                 # showWebsite flag
│   └── FlashProvider.tsx            # confirmation that survives one navigation
├── components/
│   ├── PageHeader.tsx               # breadcrumb, title, back link, actions
│   ├── CopyButton.tsx               # in-place "Copied", announced
│   ├── CodeBlock.tsx                # labelled code with its own copy button
│   ├── Tabs.tsx                     # tab-pattern primitives (path cards use them)
│   ├── WebsiteCard.tsx
│   └── WebsiteForm.tsx              # + dirty tracking, field validation, cancel slot
├── manage/
│   ├── WebsitesPage.tsx             # list only
│   ├── WebsitePage.tsx              # hub
│   ├── WebsiteEditPage.tsx
│   ├── WebsiteAddPage.tsx
│   ├── InstallPage.tsx              # path choice + steps + check
│   ├── install/                     # GithubPath, SnippetPath, InstallCheck, steps helpers
│   ├── useDirtyGuard.tsx            # confirm-on-leave for in-page controls
│   └── HealthPage.tsx               # unchanged behavior
└── analytics/AnalyticsView.tsx      # hint link target
```

Removed: `manage/InstallationPage.tsx`, `components/IntegrationSnippet.tsx`, `components/WebsiteList.tsx`.

## Design Decisions (summary; reasoning in design.md)

1. **Route model.** Keys with an `:id` segment (`manage/websites/:id`, `/edit`, `/install`) plus
   `manage/websites/new`, matched static-first. `useRoute()` returns `{ path, websiteId? }`. A
   `navKey(path)` maps website routes to the Websites nav item.
2. **Scope controls per route.** A route declares `scope: 'none' | 'project' | 'project-website'`
   and whether it shows the range. Website pages use `none`; the list uses `project`.
3. **Loading is derived, not flagged.** The scope provider exposes `websitesLoading`, true until a
   list has loaded for the current project, so a page never flashes "not found" while loading.
4. **Flash messages** carry a confirmation across one navigation (save, create, delete).
5. **Dirty guard** intercepts the page's own back link and Cancel; browser back and tab close are
   out of scope by decision.
6. **Install path** is a tab-pattern pair of cards, so choosing is keyboard and screen-reader
   correct without radio-button form semantics. Steps are an ordered list.
7. **Install check** calls the existing overview endpoint for the website over 24 hours, and the
   existing reachability endpoint on the GitHub path, in parallel.

## Complexity Tracking

Not applicable.
