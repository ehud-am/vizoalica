# Implementation Plan: Console Polish, Promo Assets, and the vizoalica.dev Docs Site

**Branch**: `014-promo-site-and-docs` | **Date**: 2026-09-19 | **Spec**: [spec.md](./spec.md)

## Summary

Small console fixes (remove the Local workspace indicator; fix the range picker layout), a repeatable
snapshot and video generator driven by fictional demo data, and a static docs and promo site built
from `docs/` with VitePress, plus a GitHub Actions pipeline that builds, checks, and (when
configured) deploys it to Cloudflare Pages for vizoalica.dev. Nothing is deployed and no Cloudflare
resource is created by this change.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 22, Markdown, Vue 3 (site theme only)

**Primary Dependencies**: existing (React, Vite, Playwright); new development-only: `vitepress`
(MIT) for the site. No new runtime dependency in any shipped package.

**Storage**: none. Generated files are committed images, a video, and static site output (not committed).

**Testing**: Vitest (docs structure, brand copies, llms.txt, workflow rules), Playwright + axe against
the built site (a11y, no third-party requests, reduced motion), existing console suites.

**Target Platform**: Cloudflare Pages (static), evergreen browsers.

**Project Type**: Documentation site (new workspace package `@vizoalica/docs`) plus scripts.

**Constraints**: WCAG 2.2 AA; no third-party origins; no tracking; source docs keep working on
GitHub; existing `docs/` paths stay (README, tests, and links use them); generation needs no network
or credentials.

**Scale/Scope**: about 20 pages, 6 images, 1 video of about 12 seconds.

## Constitution Check

| Principle / rule | Assessment |
|---|---|
| I. Privacy-minimal | Pass. No analytics or cookies on the site, no third-party requests, search runs in the browser. Demo data is fictional. |
| II. Security | Pass with a threat model below. Deploy credential scoped, read-only repository permissions, pinned actions, no fork secrets, CSP and headers. |
| III. Open source, portable | Pass. Static output can be hosted anywhere; VitePress is MIT; sources stay plain Markdown. |
| IV. Minimal infrastructure | Pass. One static Pages project; cost is zero on the free tier (see cost note). No new service. |
| V. Readable engineering | Pass. Spec first; scripts small and named; generated outputs documented. |
| Accessible experience | Pass by design: axe in the pipeline, reduced-motion handling, text equivalent for the video. |
| Development workflow | Pass. Tests accompany each change; alignment review, QA report, and go/no-go stay with the owner. |

## Design Decisions (summary)

1. **VitePress in `docs/`.** Source root is `docs/`, so file locations and links stay; the docs
   folder becomes a workspace package (`docs/package.json`) so site dependencies are isolated.
   Alternatives: a hand-written builder (would reimplement search, navigation, dark mode, and their
   accessibility), Docusaurus (heavier, React runtime), Astro Starlight (comparable, less established
   in this repo's toolchain).
2. **Links outside `docs/`** are rewritten to GitHub URLs by a build-time Markdown rule, so sources are
   unchanged and GitHub still renders them.
3. **Snapshots** come from the dev console with a mocked API and deterministic demo data
   (`scripts/promo/`), captured by Playwright at 1440x900. They live in `docs/assets/promo-src/`.
4. **Video** is an HTML animation driven by a clock parameter, captured frame by frame with
   Playwright and encoded with ffmpeg (MP4 H.264 and WebM VP9). Deterministic, no network.
5. **Brand assets** are copied into `docs/public/brand/` and a test asserts they equal the console's
   copies, so there is one source of truth without a build-time copy step.
6. **Pipeline**: one workflow with a build-and-check job (all events) and a deploy job (main only,
   only if configured, environment-scoped credential). Deployment uses the repository's existing
   `wrangler` with `pages deploy`; no third-party deploy action.
7. **Headers** via Pages `_headers`: CSP limited to `'self'` (with the inline styles and the theme
   bootstrap script VitePress needs), `nosniff`, referrer policy, frame denial, immutable cache on
   fingerprinted assets only.

## Threat Model (pipeline)

| Threat | Mitigation |
|---|---|
| A pull request from a fork steals the deploy token | Deploy job does not run on `pull_request`; PR job has no secrets; fork PRs get read-only tokens |
| A compromised third-party action exfiltrates the token | Only first-party and pinned-by-SHA actions; deployment uses the project's own `wrangler`; secret exposed to one step |
| Token has more power than needed | Documented as Cloudflare Pages: Edit only, one account; no zone or DNS permission |
| Malicious docs change ships script to visitors | CSP limited to own origin; site loads nothing external; PRs require review; branch protection recommended |
| Unintended production deploy from a branch | Deploy only on the main branch; `--branch=main` production branch; serialized |
| Credentials in the repository | None committed; the guide names secrets only |

## Cost note

Cloudflare Pages static hosting is free within its build and request allowances; a docs site of this
size uses a small fraction. There is no server, database, or storage to pay for. The domain
registration is the owner's existing cost.

## Project Structure

```text
docs/
├── .vitepress/ (config.mts, theme/, plus generated cache and dist, ignored)
├── index.md, get-started.md, tour.md
├── public/ (brand/, media/, favicon, _headers, robots.txt)
├── assets/ (logo, promo-src/ six snapshots)
├── operations/, privacy/, releases/, brand.md, v0.1.0-architecture-discussion.md   (existing)
├── package.json
└── tests/ (site.spec.ts Playwright, docs-structure.test.ts Vitest)
scripts/promo/ (demo-console.ts, capture-snapshots.ts, render-video.ts, video/index.html)
.github/workflows/docs-site.yml
docs/operations/docs-site.md   (maintainer guide)
apps/admin-web/ (header and range picker changes)
```
