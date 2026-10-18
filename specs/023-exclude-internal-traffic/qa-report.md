# QA report: Exclude Internal Traffic

**Date**: 2026-10-17 · **Branch**: `release/0.11.0` · **Reviewer**: AI agent in a skeptical QA stance (the same agent that wrote the code, so a
self-review). The release owner decides go/no-go.

The release-wide results (format, lint, types, 1,978 tests, coverage, 90 end-to-end tests, package, docs site, audit,
secret scan, migration rehearsals) are in the [022 QA report](../022-utm-campaign-report/qa-report.md); they cover this
feature as well.

## Measured against the spec (023)

SC-001 the whole path through `worker.fetch` on the real schema: an excluded batch leaves every dashboard table, the
quota table and R2 untouched except the counter, and other addresses count (`excluded-addresses-end-to-end.test.ts`);
SC-002 77 table-driven cases for address forms (v4, v6, mapped, CIDR, hostnames, bad prefixes, 26 entries); SC-003
exact boundaries for /0, /1, /8, /24, /32, /48, /64, /128; SC-004 a bad token, a missing token and an unknown key from
an excluded address are refused 401/403 and count nothing (a non-demo environment); SC-005 the SDK switch is tested
for set, unset, persisted, other values, throwing storage, no storage, the dynamic loader and in a real browser with
the built bundle; SC-006 analyst keys never receive addresses (list, create, update, status, error bodies, audit table);
SC-007 axe light and dark, 320 px, 200% zoom, keyboard-only edit; SC-008 coverage above 90%.

## Contrarian findings and their resolution

1. **Exclusion as an oracle** (probing which addresses are listed). *Resolved.* The drop happens only after the
   sender proved it may write to the website, so an unauthenticated caller always sees the normal 401/403, and a
   holder of a valid key learns only its own address's status. Tested.
2. **Addresses leaking** into errors, logs, audit, analyst responses or the counter. *Resolved.* Errors name the entry's
   position and reason only; the pipeline logs counts only; the audit entry is the existing `update_source`; the
   counter holds no address; analysts get a count. Each has a test that searches the output for the address.
3. **A bad entry partly saving.** *Resolved.* The whole request is refused at the local API and again at the Worker;
   a test shows the stored list is unchanged after a refused update.
4. **Counter failure turning a dropped batch into an error.** *Resolved.* The write is best-effort: a failure is
   logged (without the address) and the batch is still dropped with 202. Tested.
5. **IPv6 and mapped addresses.** *Resolved.* BigInt comparison, canonical spelling, IPv4-mapped clients and entries
   treated as IPv4; ranges wider than the mapped block are refused rather than misread.
6. **Old backend silently ignoring the list.** *Resolved.* An older Worker saves the rest of an edit and returns no
   list; the console detects that and tells the person to update the backend instead of confirming. Tested.
7. **Shared addresses and `/0`.** *Reduced.* Documented, with the dropped count on the website page; nothing stops an
   owner from entering `0.0.0.0/0`. The count makes the mistake visible within a day.
8. **Retention boundary.** *Accepted.* The counter's `day_utc` is compared with the retention timestamp, so the
   boundary day is removed a few hours early. The website page shows 30 days; retention is 32.
9. **Browser switch is not counted and is per origin.** *Accepted by design* (the spec says so, and the website page
   and docs repeat it).
10. **Real D1 and Cloudflare headers.** *Not done.* `cf-connecting-ip` is set by Cloudflare at the edge and cannot be
    forged by a client, but this was not observed on a live deployment. Recommended before tagging: add your own
    address on a scratch environment, send a page view, and watch **Your own visits** count it.
11. **Manual screen-reader pass** on the new form field and card. *Not done.*

## Deviations from the plan

See "Implementation notes and deviations" in [tasks.md](tasks.md).

## Recommendation

Ready for human review. Before tagging: findings 10 and 11.
