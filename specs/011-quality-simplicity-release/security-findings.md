# Phase 2 Security-Architect Review — Findings

Reviewed against the constitution's Security, Privacy, and Abuse Resistance principle and the
findings carried over from Phase 1 (spec.md FR-009). Each finding below is resolved or has an
explicit accepted-risk rationale, per the acceptance criterion for this iteration.

## Resolved this iteration

### 1. Soft-deleted websites and projects could still accept events (Critical — fixed)

**Finding**: `authorizeSource` only rejected `source.status === 'disabled'`. A source whose status
was `'deleted'` (set by the existing website soft-delete feature, already shipped before this
release) fell through and was still accepted for ingestion — soft-deleting a website did not
actually stop it from collecting events, contradicting the operator-facing documentation's implied
behavior.

**Fix**: `apps/ingest-api/src/auth/source-authorizer.ts` now denies by default — only
`status === 'active'` is accepted, at both the source and (new) project level — rather than
block-listing `'disabled'` specifically. This also closes the same gap for any future status value
added later.

**Verification**: new unit tests in `apps/ingest-api/tests/unit/edge-branches.test.ts` cover
`'deleted'` source status and `'deleted'` project status explicitly; the full existing test suite
(462+ tests) continued to pass.

### 2. Config-overwrite guard depended on hardlink support (Medium — fixed)

**Finding**: `writeConfigFile`'s "refuse to overwrite an existing file" guard (added in the
credential-hardening work folded into Phase 0) created a temp file then used `linkSync` +
`unlinkSync` to atomically place it — a POSIX-specific pattern that fails on filesystems without
hardlink support (e.g., some network-mounted paths, FAT-family filesystems).

**Fix**: `apps/local-ops-api/src/config.ts` now uses `writeFileSync(path, content, { flag: 'wx' })`
directly for the non-replace case. `O_CREAT | O_EXCL` (`'wx'`) is itself the atomic,
TOCTOU-safe "fail if it already exists" primitive Node exposes on every platform — the temp
file/hardlink dance was solving a problem this flag already solves, while being less portable.
The `replace: true` path keeps its temp-file-then-rename (still the correct, portable way to
atomically *replace* an existing file's contents).

**Verification**: existing `access-control.test.ts` and `cli-security.test.ts` tests continued to
pass unmodified against the new implementation.

### 3. `pnpm ops setup`/console had no way to delete a project (Medium — fixed, feature request)

Added at the user's explicit request as part of this iteration's scope. See the Phase 1-style
change entry: new `status` column on `projects` (D1), `DELETE /v1/admin/projects/:id` (cascades
to the project's sources), console UI (Delete button + confirm dialog), full test coverage at the
Worker/local-ops-api/admin-web layers, and a live end-to-end verification against the real
deployed backend (create → add website → delete project → confirm cascade, using a disposable
test project, left soft-deleted per the audit-retention design rather than hard-purged).

## Confirmed safe, no action needed

### 4. `VIZOALICA_DEMO_MODE` / unsigned-demo bypass cannot reach a production project

`apps/ingest-api/src/ingestion/pipeline.ts:86` allows an unsigned event only when
`allowUnsignedDemo && project.mode === 'demo'`. Checked every code path that can set
`project.mode`: the only one is `apps/ingest-worker/src/http/admin-adapter.ts`'s project-creation
route, which hardcodes `mode: 'production'` — there is no request parameter or admin API path that
can ever create or promote a project to `mode: 'demo'`. The bypass is dead code in any real
deployment (`VIZOALICA_DEMO_MODE` also defaults to `"false"` and is documented as such). No
finding; verified by code inspection, not just by the flag's default.

## Accepted risk (documented, not resolved this iteration)

### 5. `VIZOALICA_TOKEN_SECRET` is one global secret shared by every website (High — accepted, deferred)

**Finding**: The Worker verifies ingest tokens with a single `VIZOALICA_TOKEN_SECRET`, and every
website's Pages Function must be configured with that *same* value to sign tokens the Worker will
accept. This means any one website's leaked Pages secret lets an attacker forge a valid-looking
ingest token claiming to be *any* project/source on the backend, not just their own — there is no
per-tenant cryptographic isolation between websites sharing one backend.

**Why not fixed this iteration**: A real fix (a distinct signing secret per source/project,
looked up by the Worker at verification time) requires storing verifiable secret material in D1,
a new one-time secret-reveal flow in the console (comparable to a cloud provider's access-key
creation UX), a Worker code path that does a D1 lookup on every token verification (a
performance/cost question that belongs to the Phase 3 platform-engineer review, not this one), and
a rotation story or admins need for a leaked per-site secret. This is a genuine architecture
change, not a targeted fix, and rushing it risks introducing new bugs in the exact code path this
finding is about.

**Accepted-risk rationale and mitigation for now**:
- Treat `VIZOALICA_TOKEN_SECRET` with the same sensitivity as `VIZOALICA_ADMIN_SECRET` — it is
  effectively a backend-wide credential, not a per-website one, despite living in each website's
  Pages secret store.
- If any one website's Pages secret is suspected compromised, the documented mitigation
  (`docs/operations/cloudflare.md`, "Suspected signing-secret exposure") already covers the
  correct response: rotate the Worker's secret and every connected website's copy together, which
  invalidates all outstanding tokens everywhere until redeployed — this iteration's live rotation
  (done twice, for `vizoalica-sample` and the `gitlocal.dev` cutover) is a working proof that this
  procedure is operationally feasible today.
- Flagged as a design item for a future release: move to per-source signing secrets once the
  console has session/credential-reveal UX to support it safely.

### 6. No application- or edge-level rate limiting beyond per-project quotas (Medium — accepted, deferred to Phase 4)

**Finding**: `reserveQuota`'s per-second/per-day event-count checks are per-project accounting
limits, not abuse-resistant rate limiting — there is no IP- or client-based throttle anywhere in
`apps/ingest-worker`/`apps/ingest-api`, and no Cloudflare Rate Limiting Rule is configured in this
repository (that's a zone-level Cloudflare feature, not something expressible in `wrangler.toml`).
Cloudflare's baseline DDoS protection is always active regardless, but a targeted, moderate-volume
abuse pattern against one project's ingest endpoint is not specifically throttled beyond its own
quota.

**Why not fixed this iteration**: adding an actual Cloudflare Rate Limiting Rule requires
zone-level Cloudflare API access this session's credentials do not have (confirmed: DNS/zone
write actions were blocked during the Phase 1 domain cutover work), and is explicitly slated as
Phase 4 (Cloudflare-deployment-expert review, spec FR-011) work, which is the right place for it —
that phase already needs to touch Cloudflare-account-level configuration for the CI/CD workflow's
API token scope.

**Carried forward to Phase 4** with this finding attached as its starting scope item.

## Reviewed and found already sound (no change)

- Local API loopback binding, session cookie handling, CSP, `no-store` response headers — matches
  the constitution's "fail closed" and "narrow, auditable remote-data interfaces" requirements.
- Ingest token verification (HMAC-SHA256, five-minute lifetime, 25-event cap, constant-time
  compare via Web Crypto) — unchanged, sound.
- `deploy-cli`'s secret redaction (`apps/deploy-cli/src/redaction.ts`) and append-only audit log —
  unchanged, sound.
- The new GitHub Actions deploy workflow's own secret handling (Phase 1): `CF_API_TOKEN` is
  documented as scoped to Cloudflare Pages: Edit only; all third-party actions are pinned to a
  commit SHA (matching this repo's existing `ci.yml` convention); no secret value is ever echoed
  to workflow logs (`VIZOALICA_TOKEN_SECRET` and `CF_API_TOKEN` are only ever referenced via
  `${{ secrets.* }}` interpolation into `env:`, never printed).
