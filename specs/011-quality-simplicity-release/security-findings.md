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

### 6. No application- or edge-level rate limiting beyond per-project quotas (Medium — mitigated, opt-in)

**Finding**: `reserveQuota`'s per-second/per-day event-count checks are per-project accounting
limits, not abuse-resistant rate limiting — there was no IP- or client-based throttle anywhere in
`apps/ingest-worker`/`apps/ingest-api`. Cloudflare's baseline DDoS protection is always active
regardless, but moderate-volume abuse against one source's ingest endpoint was not throttled
beyond its own quota.

**Resolution (Phase 4)**: the original assumption that a rate limit needed zone-level access was
wrong for this mechanism. The Workers Rate Limiting binding is declared in `wrangler.toml` and
uses only Worker-level permissions. The Worker now consults an optional
`VIZOALICA_INGEST_LIMITER` binding, keyed by `cf-connecting-ip` alone, before reading the
request body or touching D1, and answers `429 rate_limited` with `Retry-After`. It fails open if
the limiter errors. The block ships commented out in `wrangler.example.toml`, so existing
deployments are unchanged until an operator opts in (`docs/operations/cloudflare.md`, "Ingest
rate limiting"). The key excludes the caller-supplied `x-vizoalica-source` header on purpose: an earlier
draft included it, and code review showed a caller could vary it to get a fresh bucket per
request. Verified with `wrangler deploy --dry-run` (binding accepted) and unit tests for deny,
key shape, header-variation, and fail-open. Not enabled on the live deployment: that is an operator decision
with a traffic-tuning component.

**Residual risk**: opt-in means an operator who does not enable it has the prior posture. Zone-level
WAF rules and bot controls need zone access this session did not have and stay documented as an
optional layer. Accepted (Medium).

### 7. Unauthenticated ingest requests cost D1 reads (Medium — fixed)

**Finding**: `ingestBatch` verified the token but then ran `authorizeSource` (source and project
D1 lookups) even when the token was missing or invalid, only rejecting afterwards. Anyone could
drive database reads at no authentication cost.

**Fix**: `apps/ingest-api/src/ingestion/pipeline.ts` returns 401 immediately when the token is
missing or invalid and the unsigned-demo bypass is off (finding 4 shows it cannot apply to a
production project). New tests assert zero source lookups for these requests and that the bypass
path still reaches the lookup. Side effect: an unknown source key with no token now reports 401
rather than 403, which also stops the endpoint from confirming which source keys exist.

### 8. Retention cleanup could not keep up, and two tables were never pruned (Medium — fixed)

**Finding**: found in the platform review. The daily job deleted at most 1,000 rows per table, so a
busy source grew D1 without bound; `ingestion_decisions` and `quota_windows` were never deleted.
Unbounded growth is a cost and availability risk (D1 has a per-database size limit). Fixed by
draining in repeated batches with a per-run cap and pruning the two operational tables; see
`docs/operations/cost-model.md`.

### 9. Console reachability check fetches an operator-supplied origin (Low — fixed)

**Finding**: the reachability route added in Phase 1 fetches `<allowed origin>/vizoalica/config.json`
from the operator's machine. It sends no credentials, refuses redirects, and has a 5 second
timeout, but read the whole body.

**Fix**: the body is now capped at 16 KiB and anything larger reports `malformed_response`. The
origin comes from an authenticated administrator's own website configuration, and only a coarse
status (never the body) is returned to the browser, so this is not an exploitable server-side
request forgery path; it is a resource-exhaustion hardening.

### 10. OneCLI trust boundary (reviewed — sound, one documentation clarification)

**Reviewed**: `scripts/vizoalica-ops.ts`, `apps/local-ops-api/src/cli.ts`, `docs/operations/ops-cli.md`.

- The admin secret never appears in local configuration in OneCLI mode: only the literal
  `onecli-managed` placeholder, which `configure` refuses to accept as a real credential.
- `pnpm ops` accepts no secret arguments, and OneCLI receives project, agent, and gateway values
  only. Verification runs through `onecli run` against the exact Worker host.
- The `VIZOALICA_ONECLI_WRAPPED=1` check is a wrong-command guard, not a boundary; the source
  comment already says so and the threat model agrees (anyone who can set it has local shell
  access, and so has the config file). No change needed.
- The reachability call in finding 9 is made by the local API, which may run inside `onecli run`.
  It targets the customer's website and not the Worker host. Per the operator guide, OneCLI injects
  the credential only into HTTPS requests to the exact Worker host, so the admin credential is not
  attached to it even if the request is routed through the gateway. This relies on OneCLI's host
  scoping (documented, not re-tested here) and the fetch itself sends no `Authorization` header.

**Residual**: OneCLI's own gateway and card scoping are outside this repository. The operator guide
already requires a dedicated agent with only this environment's card. Nothing to fix.

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
