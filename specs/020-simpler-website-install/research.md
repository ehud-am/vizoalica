# Research: Simpler Website Management and Install

## R1 - Environment / project switcher control

- **Decision**: A small disclosure-button menu (button opens a list with `role="menu"`/`menuitemradio` semantics, arrow-key navigation, Escape closes), not a native `<select>`. The button shows the name, with the role as a separate `badge`, and the chevron sits in its own reserved column. Unusable environments are disabled items with their reason in a second line. One environment renders the same button without opening.
- **Rationale**: The overlap comes from native select padding plus a long `name (role)` string that cannot be styled per part. A custom control lets role and reason be separate elements and reserves space for the chevron. The project menu reuses the same component.
- **Alternatives**: (a) keep `<select>` and add right padding: fixes the overlap, but role and reason stay crammed in one string. (b) a full-screen dialog: heavier than the task. (c) a native `<select>` with `<optgroup>`: does not solve per-part styling.

## R2 - Default token path in the SDK embed

- **Facts**: `embed.ts` today creates a token provider only when `data-token-url` is present; without it events go out as `unsigned-demo`. The generated tag always includes `data-token-url`.
- **Decision**: When `data-token-url` is absent the embed uses `/vizoalica/ingest-token`. An explicit `data-token-url="none"` means unsigned (demo). The dynamic configuration document treats `data-token-url`, `data-consent` and `data-project` as optional with the same defaults; documents that carry them behave as before.
- **Rationale**: Signed is the only production mode, so the safe default is signed. Tags that already carry the attribute are unchanged (FR-006).
- **Risk**: an existing tag that relied on the *absence* of the attribute for unsigned demo now requests the token path and, if missing, sends nothing extra (the provider returns undefined on failure, so it degrades to today's unsigned behaviour). Covered by a negative test.
- **Alternatives**: a new attribute for "short form" (rejected: two meanings for absence); leaving token as required (rejected: defeats the goal).

## R3 - What the recommended embed contains

- **Decision**: `src` (site-relative `/vizoalica.js`), `data-endpoint`, `data-source`. Project, token URL, consent and auto page view default. That is **2 copied values** (endpoint, source), meeting SC-001. The endpoint is not inferable from a customer site, so it stays.
- **Rationale**: The ingest pipeline resolves the project from the source key (`source-authorizer` looks the source up by its public key), so `data-project` is redundant. The event's project field is set server-side.
- **Alternatives**: a single combined key that encodes endpoint and source (rejected for now: new format to version and document; noted as a follow-up); serving the SDK from the backend so the endpoint defaults to the script origin (rejected: constitution favours no new backend surface; also changes hosting).

## R4 - Site-relative SDK location

- **Decision**: Snippet uses `src="/vizoalica.js"`; the generic loader path is unchanged.
- **Rationale**: The current generator builds the script address from the first allowed origin, which is wrong for `www` or a preview host; a relative path works on every hostname the file is served from.
- **Alternatives**: keep the absolute form as "customize" output (kept as an option in the customize view).

## R5 - GitHub → Cloudflare variables

- **Facts**: eight repository variables plus `CF_ACCOUNT_ID`, `CF_PAGES_PROJECT` and two secrets; the reusable workflow requires all of them.
- **Decision**: Make `VIZOALICA_PROJECT_ID`, `VIZOALICA_TOKEN_URL`, `VIZOALICA_CONSENT` and `VIZOALICA_SDK_SRC` optional with defaults matching R2–R4. `VIZOALICA_SOURCE_ID` and `VIZOALICA_SITE_ORIGINS` are still needed by the token signer, so the guidance shows them as one grouped line ("your website's ID and origins"). Result: public values `VIZOALICA_INGEST_ENDPOINT`, `VIZOALICA_PUBLIC_SOURCE_KEY`, `VIZOALICA_SOURCE_ID`, `VIZOALICA_SITE_ORIGINS` (4) + `CF_ACCOUNT_ID`, `CF_PAGES_PROJECT` (2) + 2 secrets = 8, then reduce further by prefilling the two account values (R6) and dropping `VIZOALICA_PROJECT_ID` from the signer if the token claim can use the source alone (R8).
- **Target reality check**: The spec target of ≤ 5 (SC-002) needs both prefilling and R8. If R8 fails, SC-002 becomes ≤ 6 and the spec is updated, not silently missed.
- **Alternatives**: a single JSON variable holding all public values (one value instead of four; kept as a fallback if R8 fails).

## R6 - Cloudflare account values

- **Decision**: The CLI already talks to Cloudflare for `deploy`; guidance shows a command that prints both values and, where the environment record already holds the account, prefilled values. No new Cloudflare permission is requested by the console.
- **Alternatives**: the console calling Cloudflare (rejected: the console must not hold credentials).

## R7 - Where the install-path choice lives

- **Decision**: Recommend one path by default (the GitHub path when the dynamic mode is offered), remember the choice per browser as today, and do not add a schema field this release. FR-018 is met as "same recommendation everywhere; an explicit choice is remembered on this browser". The spec text is adjusted to say so.
- **Rationale**: A stored per-website setting needs a Worker migration for a convenience.
- **Alternatives**: store on the website record (deferred).

## R8 - Does the token signer need the project?

- **Open check (first task of the install thread)**: read `examples/cloudflare-pages/functions/vizoalica/ingest-token.ts` and the authorizer's `token_source_mismatch` rule. If the claim is checked against the source only, the signer and workflow drop `VIZOALICA_PROJECT_ID`. If the project is checked, keep it as a default-filled variable and accept ≤ 6 for SC-002.

## R9 - Origin normalisation

- **Decision**: A pure function that trims, adds `https://` when no scheme, lowercases the host, drops path, query, hash and trailing slash, keeps a non-default port, converts internationalised hosts via `URL`, rejects non-http(s) and shows the result before saving. `http` for non-local hosts is accepted as input but the existing rule still refuses it on save with the current message. Offer the `www` counterpart when the host has no subdomain or is `www.`.
- **Alternatives**: normalise on the server (rejected: the form must show the result before saving; server keeps its validation as the authority).

## R10 - Scope in the header and route flags

- **Decision**: Extend the route definition: `scope: 'none' | 'project' | 'project-website'` keeps meaning "which page-level controls exist"; a new `header` scope group is always rendered except when the route is `manage/projects`. `ScopeBar` loses its project select. `manage/backend` becomes an alias route that renders Health.
- **Rationale**: Smallest change to the router; nav removal is a `nav: false` flag plus the alias.

## R11 - Projects switch behaviour on environment change

- **Decision**: On environment change the console reloads its session (already the case: `connect()` remounts the scope provider). Keep the prior project if its id is in the new list, otherwise select the first and show a one-time notice (FR-027).

## R12 - Access keys placement

- **Decision**: The key list and revoke move under `Access keys`, opened from the Share section on a website and from the environment menu, admin only. The route stays for deep links but `nav` is false; the capability check that hides it from non-admins is unchanged.


## Outcomes recorded during implementation (2026-09-25)

- **R8 (token signer)**: the signer's claims carry `project_id` and `source_id` and the ingest authorizer checks both against its own records (`token_source_mismatch`), so the signer needs both and the project ID cannot be dropped. SC-002 is met instead by the bundled fallback from R5: one `VIZOALICA_SITE` JSON variable (endpoint, source key, project ID, source ID, origins) plus `CF_ACCOUNT_ID`, `CF_PAGES_PROJECT` and two secrets = 5 values. The workflow splits it with `jq`, lets a separate variable win, and rejects any value that could inject another variable.
- **R9 (http)**: the service accepts any `http`/`https` origin, so there is no save-time refusal of non-local `http`. The form shows a hint instead (signed tokens need https).
- **R6 (account values)**: no console change; the guidance prints one `wrangler` command that lists the account and Pages projects.
- **R2 (token default)**: an absent `data-token-url` now means the conventional path; a missing endpoint degrades to unsigned sending without throwing (tested).
- **Install check**: probes the SDK file, the token endpoint (asked with the site's own `Origin`, body never read) and the config file (GitHub path only). A single-page-app host that answers unknown paths with its home page counts as "missing". The token the endpoint issues to the probe is discarded; it lives five minutes and carries no privileges beyond the site's own.
- **Projects rename**: the service has no project rename, so it is not offered.
