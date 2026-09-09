# Skeptical QA review: 0.3.1

Reviewer: primary implementation agent in a separate adversarial review pass. The SpecKit research
subagent was unavailable due to an account usage limit; this report does not claim independent
agent review. Date: 2026-09-09.

## Questions challenged and resolutions

1. **Could a first-time operator deploy before the prerequisites exist?** The old order required
   preflight before the administrator secret existed and described seeding before clearly applying
   the full schema. The new order creates storage, saves both secrets, migrates/deploys, then
   creates a source. Every step has a checkpoint. The Pages project/source dependency is explicitly
   linked, with the Pages name/origin established before source creation.
2. **Does the pasted SQL actually work today?** Applied all four migration files to temporary
   SQLite and executed the documentation block. The required source name and timestamps are now
   present. No existing migration was changed.
3. **Is a plausible script URL being mistaken for a hosted bundle?** The README and SDK docs now
   say the Worker serves neither bundle nor issuer. The explicit build produces an IIFE tested
   in JSDOM; copy and Pages deployment steps install it at the advertised path.
4. **Can the operator obtain every identifier without developer tools?** The local console now
   shows project ID, source ID and public key with distinct labels. HTML uses the configured Worker
   URL and escaped source metadata. A missing snippet disables copying rather than fabricating a
   broken script tag. Long identifiers wrap in the card.
5. **Does consent wording promise behavior the SDK lacks?** The SDK records consent but does not
   enforce a consent gate. This is stated explicitly. The example loads no SDK until Allow is
   chosen, and Decline is tested to leave the SDK unloaded. No imaginary SDK consent setter is used.
6. **Does an HTML fallback still pass verification?** MIME, body parseability and token structure/
   scope/lifetime checks reject the tested false-positive cases. The guide separately requires a
   real browser 202 and aggregate count. The verifier explicitly does not claim to check signatures.
7. **Are credential fixes weakening isolation?** Real ambient Cloudflare credentials are still
   stripped. Only the wrapped Wrangler process receives a constant non-secret placeholder.
   Origin takes precedence over Referer, and foreign/missing/malformed provenance fails. The
   Pages Function scopes claims from trusted configuration rather than request parameters.
8. **Was the OneCLI upload workaround quietly made permanent?** No proxy bypass is shipped.
   The original upload-JWT report is identified as an external limitation. Native Pages deployment
   is an explicit operator choice, while a policy requiring full vault routing must wait for a
   verified upstream solution. The profile runner's lack of a gateway override is stated.
9. **Does cheap mean no possible charges?** No: the guide distinguishes included usage from a
   spending cap, accepted-event quotas from all request costs, D1 retention metadata from R2
   lifecycle deletion, and static assets from Function invocation.
10. **Were failures hidden by test exclusions or an outdated audit?** Coverage was expanded to the
    example and verifier, then negative tests were added. Audit findings for sharp and js-yaml
    were fixed with bounded overrides. All 190 tests pass with both coverage thresholds above 90%.

## Alignment

All requirements FR-001–FR-009 and user stories US1–US3 map to completed tasks. The incident
[18-item disposition table](../../docs/operations/troubleshooting.md#coverage-of-the-original-18-findings)
accounts for every reported issue. No migration, cloud service or paid subscription was added.
Root version and changelog are 0.3.1; workspace package versions remain independent, as in 0.3.0.
README, operations guides, examples, local response behavior and provider budgets agree.

## Remaining boundaries

No local-review blockers found. Live account setup/ingestion validation and an official release
decision remain distinct from these local results. External OneCLI behavior and the separate sample
repository were not modified. UI changes preserve semantic markup and tested keyboard-focus semantics and clipboard
behavior; manual assistive-technology review remains part of an official release's accessibility
validation. See [validation.md](validation.md) for exact evidence and limits.
