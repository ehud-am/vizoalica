# No-script pixel: privacy review

**Status**: Recorded 2026-10-27 for [spec 025](../../specs/025-no-js-pixel/spec.md). It covers what version 0.13.0 adds:
a per-website switch and an image endpoint that counts a page view.

## Decisions

| Data                            | Decision  | Purpose                                         | Retention                               | Access boundary                                 | Re-identification risk                                                                                                                 |
| ------------------------------- | --------- | ----------------------------------------------- | --------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **`pixelEnabled` flag**         | Approved  | Let the owner opt a website in                  | Until changed or the website is deleted | Admin and website-owner keys write; all read it | None. A boolean of operator configuration.                                                                                             |
| **`path` query value**          | Approved  | Name the page the view belongs to               | As any page key                         | As page paths in reports                        | Low. Chosen by the website owner, not by a visitor; validated as a plain path (no query, no fragment) and normalized as page keys are. |
| **Client address and agent**    | Approved  | Daily visitor digest and coarse browser classes | Address not retained; digest as today   | Worker memory                                   | None beyond the script path: the same salted daily digest, salt deleted after the day.                                                 |
| **Event marker `pixel`**        | Approved  | Tell pixel views apart in the raw archive       | As raw events                           | As raw events                                   | None.                                                                                                                                  |
| Referrer, query string, cookies | Not added | None needed                                     | n/a                                     | n/a                                             | n/a                                                                                                                                    |

## Rules that hold

1. Off by default; a database or website without the flag counts nothing from the pixel.
2. Nothing is stored in or read from the browser. No cookie, no local storage, no redirect, no fingerprint beyond
   the existing daily digest.
3. Every request gets the same image, so the endpoint does not reveal whether a website key exists or has the
   pixel on.
4. A counted view carries no referrer, no title, no query and no campaign labels.
5. Hits can be forged because an image request has no origin; the docs say so and advise a separate website.
