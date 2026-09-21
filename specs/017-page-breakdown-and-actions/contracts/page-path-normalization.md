# Contract: Page key normalization

The public, testable definition of what a page is called. One implementation
(`normalizePagePath` in `packages/privacy`) is shared by the browser SDK and the ingestion privacy
guard. It is documented for site owners in `docs/operations/browser-sdk.md` and is the corpus behind
success criteria SC-001 to SC-003.

## Input and output

- **Input** to the SDK: the page's `pathname` and `hash`. **Input** at ingestion: an event's
  `url_path` string, which may already contain one `#`.
- **Output:** a page key: `<path>` or `<path>#<route>`.
- **Pure and idempotent:** `normalize(normalize(x)) == normalize(x)`.
- **Never throws**, and never returns a string containing `?`.

## Steps

1. Split off the fragment at the first `#`. Anything after a second `#` is discarded.
2. Fragment: keep only if it begins with `/`. Cut it at the first `?`. Otherwise (anchors such as
   `#section-2`, tokens such as `#access_token=...`) discard it.
3. Split the path and the route on `/`. Empty segments are dropped, then the result is re-joined
   with a leading `/`.
4. Replace each identifier segment with `:id` (table below), except segments inside a date run.
5. Remove a trailing `/` (the root stays `/`).
6. Join as `<path>#<route>` when a route remains. Truncate to 1,024 characters.

## Identifier segments

| Shape                                                            | Example                                   | Result |
| ---------------------------------------------------------------- | ----------------------------------------- | ------ |
| Digits only                                                      | `8841`, `2`, `0007`                       | `:id`  |
| UUID (any case)                                                  | `3f2b8c1e-5d4a-4a37-9c1b-0e7d2a6f9b10`    | `:id`  |
| Hexadecimal, 16 or more characters                               | `5f2b8c1e5d4a4a37`                        | `:id`  |
| 20 or more of `A-Za-z0-9_-` with an uppercase, a lowercase, and a digit | `V1StGXR8_Z5jdHi6B-myT`            | `:id`  |
| ULID: 26 uppercase Crockford base32 characters including a digit  | `01ARZ3NDEKTSV4RRFFQ69G5FAV`              | `:id`  |
| Contains `@`                                                     | `jane@example.com`                        | `:id`  |

**Kept as written:** words and readable slugs (`pricing`, `my-first-post`, `blue-widget`),
versions (`v2`), file names (`logo-1234.png`), segments that are already `:id`.

**Date runs are kept:** a year (`19xx` or `20xx`) immediately followed by a month (`1` to `12`, one
or two digits), then optionally a day (`1` to `31`). `/blog/2026/09/launch` stays; `/orders/2026`
does not (a lone year is not a date run).

## Worked examples

| Input (`pathname` + `hash`, or ingestion `url_path`)                    | Page key                                   |
| ----------------------------------------------------------------------- | ------------------------------------------ |
| `/` + `#/pricing`                                                       | `/#/pricing`                               |
| `/` + `#/orders/8841?tab=items`                                         | `/#/orders/:id`                            |
| `/orders/8841/`                                                         | `/orders/:id`                              |
| `/orders/8842`                                                          | `/orders/:id`                              |
| `/users/3f2b8c1e-5d4a-4a37-9c1b-0e7d2a6f9b10/settings`                  | `/users/:id/settings`                      |
| `/blog/my-first-post`                                                   | `/blog/my-first-post`                      |
| `/blog/2026/09/launch`                                                  | `/blog/2026/09/launch`                     |
| `/page/2`                                                               | `/page/:id`                                |
| `/docs` + `#section-2`                                                  | `/docs`                                    |
| `/callback` + `#access_token=abc&state=x`                               | `/callback`                                |
| `/app#/reset/V1StGXR8_Z5jdHi6B-myT`                                     | `/app#/reset/:id`                          |
| `/pricing/` and `/pricing`                                              | `/pricing` (same page)                     |

## Test corpus (SC-003)

Automated tests keep a fixed corpus in two lists and assert both:

- **Must group:** at least 40 numeric, UUID, hexadecimal, token, and email-shaped segments in varied
  positions.
- **Must stay:** at least 40 readable words, slugs, versions, file names, and date-shaped runs.

The corpus is versioned with the code so a rule change has to update it deliberately.

## Where it runs

| Place                          | Purpose                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------- |
| SDK, before an event is built  | Raw identifiers and fragments never leave the browser                              |
| Ingestion privacy guard        | Older SDK files and other clients get the same result; hostile clients cannot bypass it |
| Neither: the console           | It only displays keys it receives; it never regroups data                          |
