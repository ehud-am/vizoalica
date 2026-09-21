# Privacy Defaults

Vizoalica is designed to collect minimal product analytics data by default.

## What the browser SDK collects by default

- Page origin and path, with identifiers such as `/orders/8841` replaced by `:id`, and the route
  after `#` for fragment-routed sites (for example `/#/pricing`).
- Actions: which button or link was clicked, on which page. Each records a short name taken from the
  control's own label (redacted, at most 80 characters), its kind, and, for links, the destination's
  origin and path. See [what actions record](#actions-clicks-on-buttons-and-links).
- A boolean indicating whether a query string was present and redacted.
- Optional page title, capped in length.
- Anonymous visitor and session identifiers.
- Explicit custom events created by the site owner.
- Safe scalar custom properties after filtering.

## What is not collected by default

- Raw form input values.
- Passwords, payment data, access tokens, refresh tokens, API keys, cookies, or authorization headers.
- Full URL query values, or address fragments that are not routes (anchors, tokens, sign-in data).
- Raw page text or DOM snapshots.
- Session replay, heatmaps, or click recordings: actions are counted, with no position, timeline,
  or replay.

## URL handling

The browser SDK minimizes URLs before event delivery:

```text
https://example.com/pricing?token=secret&plan=pro
```

becomes structured data equivalent to:

```json
{
  "url_origin": "https://example.com",
  "url_path": "/pricing",
  "url_query_redacted": true
}
```

The backend rejects page-view events that appear to contain unredacted query values in the path.

## Actions: clicks on buttons and links

The SDK counts clicks on buttons, links, and controls that behave like them, so the console can show
which are used. It is always on for a website that runs the current SDK file; there is no setting
to turn it off, and consent is honored (nothing is recorded when consent is explicitly denied).

Recorded per action: the page, the control's name, its kind, and for `http` and `https` links the
destination's origin and path. Names come from `data-vizoalica-action`, `aria-label`, the visible
text, `title`, or an image's `alt`. They are shortened to 80 characters, and email addresses, runs
of six or more digits, and token-shaped words are replaced by `[email]`, `[number]`, and `[token]`,
in the browser and again at the backend.

Never recorded: anything typed or the value of any field, text inputs, passwords, payment fields,
link queries and fragments, `mailto:` and `tel:` addresses, cookies, positions, or element
identifiers. Site developers exclude a control or an area with `data-vizoalica-ignore`, and name a
control with `data-vizoalica-action` (see the [Browser SDK](./browser-sdk.md#naming-and-excluding-controls)).

Identifiers in paths are grouped before storage (`/orders/8841` is stored as `/orders/:id`), so
record identifiers, which can be personal data, are not kept. The
[action collection review](../privacy/action-collection-review.md) records the purpose, retention,
and access boundary of each new field. Reports show aggregates only, never a visitor identifier.

## Custom property rules

Custom event properties are limited to safe scalar values. Property names that look sensitive are rejected or removed, including names containing:

- `password`
- `secret`
- `token`
- `api_key`
- `authorization`
- `cookie`
- `email`
- `phone`
- `credit_card`
- `card_number`

Unsafe example:

```ts
client.track('signup_click', {
  properties: {
    plan: 'pro',
    password: 'do-not-send',
    accessToken: 'do-not-send'
  }
});
```

Safe example:

```ts
client.track('signup_click', {
  properties: {
    plan: 'pro',
    billing_period: 'annual'
  }
});
```

## Backend enforcement

Client-side filtering is a convenience, not a trust boundary. The ingestion backend also validates privacy defaults before persistence and rejects events that contain sensitive-looking fields or unredacted URL query values.

## Location

Only the visitor's country is recorded, as an aggregate count. The console shows it by full name
and groups it by continent. Nothing finer (region, city, or language) and nothing about people
(age, gender, interests) is collected. The
[audience attributes review](../privacy/audience-attributes-review.md) records the decision for
each and the conditions under which any of them could be considered later.

## Deleting data

Deleting a website or project in the console is permanent. Events for it are rejected at once,
and the daily cleanup removes its raw event batches and every database row for it, including
its audit entries. `pnpm vizoalica purge-deleted` does the same immediately. Data that was never
deleted follows the retention settings in the [backend guide](cloudflare.md).

## Logging

Operational logs and metrics must use safe reason codes and counts. They must not include raw event payloads or visitor-sensitive values.
