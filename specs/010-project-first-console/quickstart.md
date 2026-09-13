# Quickstart: Validate Project-First Console and Website Setup

## Prerequisites

- Node.js 22 or newer and pnpm 9.15.
- Dependencies installed for the repository.
- A local test configuration or mocks for the console and local operations API.
- For supervised Cloudflare validation: an authorized test Pages project and approval before any
  deployment. Automated validation must not mutate a real account.

## 1. Check the focused automated suites

Run the component, local API, SDK, example Function, documentation contract, and browser suites
added by the implementation. At minimum, the focused run must cover:

```sh
pnpm test -- apps/admin-web/tests apps/local-ops-api/tests packages/browser-sdk/tests apps/token-demo/tests apps/deploy-cli/tests/contract
pnpm test:e2e
```

Expected outcome: every story-specific scenario below passes with no serious or critical automated
accessibility violation.

## 2. Validate Projects as a primary destination

1. Start with two projects, including duplicate display names with different IDs.
2. Open Projects from the primary navigation using only the keyboard.
3. Select each project and use its direct Overview and Websites actions.
4. Confirm every destination names the current project and never retains another project's child
   data while loading.
5. Make the selected project unavailable in the mocked/project-list response and refresh.

Expected outcome: selection reconciles to another available project or the empty state, with no
cross-project website or analytics content.

## 3. Validate project-first website creation

1. Open Add website while the browsing context already has a selected project.
2. Confirm the first form control is an empty, required Project dropdown.
3. Attempt submission without a project, then select the non-current project and submit valid
   website details.
4. Confirm the result names the new website and chosen project and appears only under that project.
5. Repeat with no projects and confirm the form is unavailable and its action opens Projects.
6. Simulate project access loss between form entry and submission.

Expected outcome: no attempt creates a website without an explicit available project, and failed
submission retains safe draft fields without a partial record.

## 4. Validate both installation options

For one registered website:

1. Open installation guidance and confirm exactly two choices.
2. Select Static snippet and compare the output byte-for-byte with the pre-feature fixture.
3. Select Dynamic configuration and copy its generic snippet and public configuration.
4. Repeat for a second project/site and confirm the generic snippet is identical while all six
   configuration values are correctly scoped.
5. Exercise the dynamic loader against valid, missing, malformed, unsupported-version, stale,
   wrong-project/source, wrong-origin token URL, and unreachable configuration responses.
6. Place static and dynamic loaders together and confirm the SDK initializes at most once.

Expected outcome: static remains compatible; valid dynamic configuration creates the existing SDK
script only after host consent; every invalid case sends no event, creates no fallback client, and
does not impair the host page.

## 5. Validate the Cloudflare example without mutation

Check that the displayed/example public vars map exactly to the contract and exclude all private
values. Review commands and assets without deploying:

```sh
pnpm exec wrangler --version
pnpm exec wrangler pages functions build examples/cloudflare-pages/functions --outdir /tmp/vizoalica-pages-functions
pnpm exec wrangler pages dev examples/cloudflare-pages/public --cwd examples/cloudflare-pages
```

Request `/vizoalica/config.json` from the local Pages session and run the applicable website
verification checks. Confirm `_routes.json` includes both config and token Functions.

For a supervised production test only, first verify the exact account, Pages project, environment,
branch, directory, public vars, and diff. Obtain human approval, use the real Git-connected or
Direct Upload path shown by the console, then inspect deployment metadata and run:

```sh
pnpm website:verify -- https://YOUR_SITE.example YOUR_PROJECT_ID YOUR_SOURCE_ID
```

Expected outcome: config/content/token checks pass, a real consented event is accepted into the
intended project/source, and blocking analytics leaves the site usable. No secret appears in the
config response, commands, logs, repository, or browser assets.

## 6. Validate footer and Local workspace context

1. Test ready, loading, denied, and offline states on short and long pages.
2. Use 320, 768, 1024, and 1440 pixel widths and 200% text zoom.
3. Confirm the footer is at the bottom on short pages, follows long content, stays centered, and
   covers no focused control.
4. Activate both links and verify their exact destinations, current year, current build version,
   and “Version unavailable” fallback.
5. Open Local workspace with the keyboard and verify its local-console/local-credential and
   possibly-remote-backend explanation.

Expected outcome: all information and interactions remain perceivable, operable, and correctly
worded at every tested size and access state.

## 7. Run repository release gates

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm coverage
pnpm build
pnpm browser-sdk:build
pnpm test:e2e
pnpm audit --prod --audit-level high
```

Expected outcome: all checks pass, repository-wide line and branch coverage remain above 90%, and
the implementation introduces no unresolved serious security, privacy, or accessibility finding.

