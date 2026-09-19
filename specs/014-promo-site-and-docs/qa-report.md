# QA Report: Console Polish, Promo Assets, and the vizoalica.dev Docs Site

**Reviewer stance**: a skeptical QA engineer written by the same AI agent that implemented the
change, so treat it as a checklist for the human owner, not independent assurance. The release
go or no-go decision belongs to the human release owner.

**Date**: 2026-09-19 · **Branch**: `014-promo-site-and-docs` (cut from `013-admin-website-pages`; uncommitted working tree)

## 1. Gate results

| Gate | Result |
|---|---|
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | Pass |
| `pnpm coverage` | 123 files, 781 tests pass. 95.98% lines, 91.88% branches (threshold 90%) |
| `pnpm build` | Pass |
| `pnpm test:e2e` (console, Chromium, mocked API) | 24 pass |
| `pnpm docs:test` (built site, Chromium) | 11 pass: axe on 11 pages in light and dark, CSP and no third-party requests, headers, search, 320px and 200% zoom, no-JavaScript reading, reduced-motion video |
| `pnpm audit` | No known vulnerabilities, after pinning `vitepress>vite` to a patched Vite 6 (see R8) |
| `pnpm docs:build` | Pass, 23 pages, about 6 MB including the video |
| `pnpm promo:video` run twice | Same output sizes both times (deterministic) |
| Workflow linting (`actionlint`) | **Not run locally** (no Docker or binary). Prettier parses the YAML; `docs/tests/pipeline.test.ts` checks its rules. CI's actionlint step will be the first real check. |

## 2. Requirement evidence

| Req | Evidence | Confidence |
|---|---|---|
| FR-001 (no Local workspace) | Component and styles removed; unit, CSS, and e2e checks assert none; docs reworded | High |
| FR-002, FR-003 (range picker) | e2e measures each radio and its label on one line at desktop, plus a CSS test that fails if the scope-bar label style is coupled again; screenshots | High for desktop; see R3 |
| FR-004, FR-005 (snapshots, fictional data) | `pnpm promo:snapshots`; images reviewed; demo data uses `.example` domains and an invented company | High |
| FR-006 to FR-008 (video) | `pnpm promo:video`; 13.5 s, 1280x720, MP4 1.9 MB, WebM, poster; frames reviewed; site test checks muted, controls, poster, text version, reduced motion | High for structure; see R4 |
| FR-009 to FR-012 (site, links, metadata, no third parties) | 23 pages built; `docs-structure.test.ts` (every doc reachable); site tests for links, metadata, sitemap, robots, llms.txt, no external requests | High |
| FR-013 (WCAG 2.2 AA) | axe clean in both themes on 11 pages; found and fixed muted-text contrast, syntax-token contrast, and a nested-button sidebar defect | Medium: automated only, see R5 |
| FR-014 (tests catch drift) | Tests fail on an unlisted doc, a brand copy that differs, a broken link, or weakened headers | High |
| FR-015 (README) | README links vizoalica.dev and the guide; screenshot regenerated | High |
| FR-016 to FR-018 (pipeline) | `pipeline.test.ts`: read-only permissions, pinned actions, one secret in one step, publish only on main and when configured, no fork path, no script injection | High for what is tested; see R1 |
| FR-019 (guide) | `docs/operations/docs-site.md`, six setup steps, check, rollback, removal | Medium: untried, see R1 |
| FR-020 (headers) | `_headers` with a CSP that has script hashes computed at build; exercised for real by the site tests | High |
| FR-021 (nothing deployed) | No Cloudflare resource created, no wrangler command run | High |
| SC-008 (six steps) | Six documented steps | Medium |

## 3. Risks and gaps (be skeptical of these first)

- **R1. The pipeline and the guide have never run.** By design nothing touches Cloudflare. That means
  the publish job has not executed, `wrangler pages deploy` flags and the secret and variable names
  have not been tried against a real account, and the guide's steps (token permissions, environment,
  custom domain, redirect rule) are written from Cloudflare's documented behavior, not from doing
  them. Expect a small correction at first publish. Also `actionlint` is unrun (see the gate table).
- **R2. The custom domain and DNS are entirely manual.** The guide assumes `vizoalica.dev` is a zone
  in the same Cloudflare account. If it is registered elsewhere or in another account, step 6 differs.
- **R3. The range picker was measured on desktop only.** The e2e test asserts the layout at the
  default desktop viewport. The existing 320px and 200% zoom checks pass, but they do not measure the
  radio rows specifically.
- **R4. The video's look depends on the machine that renders it.** It uses the system monospace font
  (SF Mono on macOS), so a render on Linux would look slightly different. The committed MP4 and WebM
  are what ships. It also has no audio and no captions, since it has no speech; its text is provided
  on the page.
- **R5. Accessibility is automated only.** No screen-reader pass on the site. The video's
  autoplay-when-motion-is-allowed behavior could not be exercised meaningfully in headless Chromium
  (autoplay policy), only its reduced-motion behavior.
- **R6. A weaker style policy than the script policy.** Inline styles are allowed by the CSP because
  the theme sets style attributes at load. Scripts are strict (site plus three build-time hashes).
- **R7. Inline-script hashes depend on VitePress internals.** The build computes hashes of the inline
  scripts it finds and fails if none are found. A VitePress upgrade that adds a per-page inline
  script would make the hash list larger, which the build handles, but a script that varies per page
  in an unexpected way could break pages under the CSP; the site tests would catch that.
- **R8. Dependency exception.** VitePress 1.6.4 depends on Vite 5, which has advisories with no 5.x
  patch (dev-server issues, mostly Windows). `pnpm.overrides` pins `vitepress>vite` to Vite 6.4.3 or
  later. It builds and passes all tests, but VitePress 1.x officially supports Vite 5, so this is off
  the supported path. Remove the override once VitePress ships with a patched Vite. The production
  audit CI runs (`--prod`) was clean before and after.
- **R9. Content accuracy.** The home, quick start, and tour pages restate the README's claims. They
  were written to match it, but they are new prose that can drift from the README. The tour's
  "fictional demo data" note is the safeguard against implying real traffic.
- **R10. Repository size.** About 9 MB of binaries were added: six PNGs (about 0.8 MB), the video in
  two formats (about 2.9 MB), the poster and social image, and a dev dependency tree for VitePress.
- **R11. Removing the Local workspace indicator drops its accessible explanation.** It is now only in
  the operator guides. Specs 010 and 012 required it; the owner's request supersedes them, and
  their documents still describe it.
- **R12. Two console defects were found by the images and fixed.** The Technology view's cards were
  squeezed at 1440px and website cards cut off their origins. Both are fixed and covered by CSS
  tests; other views have not been re-audited at every width.
- **R13. `promo:snapshots` output is not byte-stable.** Chart axis labels use the current date, so
  re-running changes the images slightly. Commit them only when you mean to.

## 4. Things the owner should know

1. **Uncommitted, and not pushed.** Nothing was committed or pushed. Branch `014-promo-site-and-docs`
   is local, cut from `013-admin-website-pages`, which is pushed but not merged.
2. **Nothing was deployed or created in Cloudflare or GitHub settings.** No wrangler command was run
   and no secret or variable was set.
3. **"promot-src" was read as `promo-src`.** A rename if that guess is wrong.
4. **A stale script was fixed.** `scripts/capture-console-screenshot.ts` still waited for a heading
   from before the console redesign; it works again and the README screenshot is fresh.
5. **Release notes.** These changes are under `[Unreleased]` in the changelog, not folded into 0.5.3.

## 5. What the owner should do

1. Read the three site pages I wrote (home, quick start, tour) for tone and accuracy.
2. Watch the video (`docs/public/media/vizoalica-intro.mp4`) and say whether the messages are right.
3. Do the one-time setup in `docs/operations/docs-site.md` when ready, run the workflow by hand, and
   expect to correct any step that differs from what is written.
4. Check the range picker and the Technology view on your own machine.
5. Decide whether the changes ship in 0.5.3 or later, and commit and push when satisfied.
