# Rage clicks: privacy review

**Status**: Recorded 2026-10-24 for [spec 024](../../specs/024-rage-clicks/spec.md). This is the review the
constitution requires before any new data field is accepted. It covers what version 0.12.0 adds: a burst signal
on the click events the SDK already sends.

## Decisions

| Field                                 | Decision | Purpose                                                | Retention                                                | Access boundary                                                          | Re-identification risk                                                                                                                      |
| ------------------------------------- | -------- | ------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **`action.rage`** (flag, `true` only) | Approved | Tell the owner which control visitors click repeatedly | 32 days as aggregates; raw batches follow the raw policy | Aggregates only, by role and scope, operator console and assistant tools | Low. A boolean on an event that already names a control and a page. Stored as a count per minute, page and control, with no visitor digest. |
| Click coordinates or element ids      | Rejected | Would show where on the page the clicks landed         | n/a                                                      | n/a                                                                      | Higher: positions and element paths can fingerprint a layout and a person's habits. The SDK never reads them.                               |
| Number of clicks in the burst         | Rejected | Would grade severity                                   | n/a                                                      | n/a                                                                      | Not needed: a burst is 3 or more; the report divides bursts by all clicks.                                                                  |
| Visitors per burst                    | Rejected | Would show how many different people hit it            | n/a                                                      | n/a                                                                      | A distinct-visitor count needs a digest per burst, one more table and one more joinable row for little gain. Revisit if owners ask.         |

## Rules that hold

1. Detection runs in the browser, on clicks the SDK already observes, by mouse or touch only; keyboard repeats
   (detail 0) never count. Nothing new is read from the page: no text, no position, no element path.
2. Controls that are not recorded as actions (plain text, images, fields, controls inside
   `data-vizoalica-ignore`) can never produce a burst.
3. The burst carries the same redacted name, page key and link destination as the click it follows. The backend
   normalizes them again, whatever the sender did.
4. The report returns counts only: bursts and clicks per control, never a visitor identifier, session, or raw
   event. Output is bounded (50 controls, the rest as "Other").
5. Volume is bounded: at most one burst per control per 5 seconds and 20 per minute per page load in the browser,
   and one row per control per minute in storage, which the 32-day retention removes.
6. Nothing is added to the browser: no cookie, no storage. The one extra network request is the burst itself,
   sent in its own batch so an older backend can reject it without losing anything else.
7. With consent denied, the SDK records no actions, so it records no bursts either. This is enforced in the SDK
   only: the Worker treats a burst like the click it follows, so a sender that ignores consent is handled the same
   way for both.

## Known limits

- A control name is text from the website. The `get_rage_clicks` tool says to treat it as untrusted data, as for
  actions.
- A repeated count from one person is indistinguishable from several people, because no visitor is stored.
