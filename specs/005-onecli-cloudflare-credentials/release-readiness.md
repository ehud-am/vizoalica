# Release Readiness: OneCLI Cloudflare Credentials

**Reviewed**: 2026-09-07

## Decision

Ready for repository review. Automated validation is complete; a real non-production Cloudflare
apply remains an explicit operator action after plan review and is not inferred from this result.

## Alignment review

| Concern | Evidence | Result |
| --- | --- | --- |
| Credential ownership | Profiles accept identifiers only; credential-like fields are rejected; OneCLI performs injection. | Pass |
| Provider isolation | OneCLI subprocesses strip ambient Cloudflare authentication; native credentials remain available only for an explicit native profile. | Pass |
| Account isolation | Check and apply require the authenticated account ID to exactly match the reviewed profile and receipt. | Pass |
| Approval integrity | Apply requires the exact plan ID, current digests, same actor/provider/account/connection, and an unexpired 15-minute receipt. | Pass |
| Least privilege | Wrangler operations are a closed catalog; the documented OneCLI matrix gates migrations and deploy. | Pass |
| Lifecycle | Detach, revocation, ambiguity, rotation, local/CI identity separation, and same-connection recovery have automated tests. | Pass |
| Recovery | Failed and interrupted apply results retain completed/pending operations and require fresh authorization before retry. | Pass |
| Audit safety | Audit serialization is allowlisted, user-only, pruned at 90 days, and now records early denial/failure outcomes when a valid profile is available. | Pass |
| Portability | The existing no-profile shell behavior remains intact and an explicit native adapter preserves native authentication. | Pass |
| Runtime scope | Browser instrumentation, analytics storage, ingestion authorization, and deployed Worker behavior are unchanged. | Pass |

## Contrarian security checks

- **Can a token enter through configuration?** No. Unknown and credential-like keys are rejected
  recursively, and the CLI exposes no token, secret, email, authorization, or passthrough option.
- **Can shell syntax escape an argument?** No. Provider commands use executable/argument arrays
  with shell execution disabled; a regression test passes shell metacharacters as inert data.
- **Can OneCLI failure fall back to Wrangler authentication?** No. Provider choice is explicit and
  each command constructs exactly one adapter. Missing, denied, revoked, ambiguous, interrupted,
  and unavailable states fail closed.
- **Can an ambient token override the selected OneCLI connection?** No. Cloudflare token, key,
  email, auth-path, and account-selection variables are removed before OneCLI inspection and run.
- **Can a reviewed plan target another account later?** No. Profile and Wrangler digests, account,
  provider, connection, actor, receipt lifetime, and the immediate pre-mutation identity check bind
  apply to the reviewed state.
- **Can upstream sensitive text reach normal output or audit?** No. Production process capture is
  bounded and redacted; command results and audit records are composed from local allowlists rather
  than provider output.
- **Can revocation be bypassed with an old receipt?** No. Apply re-inspects effective credentials
  and account identity immediately before the first mutation.
- **Can interruption be mistaken for success?** No. The child is terminated, the result is marked
  interrupted, pending operations remain visible, and the skill requires a fresh receipt.

## Residual operator boundaries

- OneCLI and Cloudflare service-side revocation latency and audit guarantees remain provider
  responsibilities.
- Operators must create narrowly scoped Cloudflare tokens inside OneCLI and protect local profile,
  receipt, and audit directories.
- Resource creation, deletion, data backup, and teardown remain separate reviewed procedures.
- A real apply must first be exercised against an isolated non-production account with the exact
  plan ID displayed to the approving human.
