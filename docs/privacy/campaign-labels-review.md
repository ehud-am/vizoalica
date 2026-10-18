# Campaign labels: privacy review

**Status**: Recorded 2026-10-17 for [spec 022](../../specs/022-utm-campaign-report/spec.md). This is the review
the constitution requires before any new data field is accepted. It covers what version 0.11.0 adds to page
views: three campaign labels read from the landing address.

## Decisions

| Field                              | Decision         | Purpose                                   | Retention                                                | Access boundary                                                          | Re-identification risk                                                                                                                                               |
| ---------------------------------- | ---------------- | ----------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`utm_source`**                   | Approved         | Attribute visits to a channel             | 32 days as aggregates; raw batches follow the raw policy | Aggregates only, by role and scope, operator console and assistant tools | Low. A label the site owner chose. Emails, long digit runs and token-like words are replaced; only letters, digits, space and `_ - . + : /` are kept; 64 characters. |
| **`utm_medium`**                   | Approved         | Attribute visits to a channel type        | Same                                                     | Same                                                                     | Low. Same cleaning.                                                                                                                                                  |
| **`utm_campaign`**                 | Approved         | Attribute visits to a named effort        | Same                                                     | Same                                                                     | Low. Same cleaning.                                                                                                                                                  |
| `utm_term`, `utm_content`          | Rejected for now | Would add search keywords and ad variants | n/a                                                      | n/a                                                                      | Higher: free text typed by advertisers, often copied from what people searched for.                                                                                  |
| `gclid`, `fbclid`, other click ids | Rejected         | None                                      | n/a                                                      | n/a                                                                      | They identify a click and can be joined to an advertiser's data. Never stored; the query is still dropped.                                                           |

## Rules that hold

1. Only the three named parameters are read; every other query value is ignored, as before.
2. The labels are cleaned in the browser and again at the backend, so the backend does not rely on the browser
   being honest. Both steps are the same function and are idempotent.
3. Only the landing page view of a page load carries labels, so a visit is counted once.
4. Reports return aggregates only: page views and distinct-visitor counts, never a visitor identifier, session,
   or raw event. Visitors use the existing keyed, daily-rotating digests.
5. Output is bounded (20 per list, 50 combinations) and the storage per website grows by at most one row per
   distinct combination per minute, which the 32-day retention removes.
6. Nothing is added to the browser: no cookie, no storage, no extra request.

## Known limits

- A label is text from a link anyone can craft. Cleaning removes the common personal forms but cannot know that
  a plain word is a person's name. Site owners should not put personal data in links.
- A small campaign with few visitors can be specific to a person only if the owner tagged a link for that person.

Anything added later needs its own entry here first.
