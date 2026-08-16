# Privacy Defaults

Vizoalica v0.1.0 is designed to collect minimal product analytics data by default.

## What the browser SDK collects by default

- Page origin and path.
- A boolean indicating whether a query string was present and redacted.
- Optional page title, capped in length.
- Anonymous visitor and session identifiers.
- Explicit custom events created by the site owner.
- Safe scalar custom properties after filtering.

## What is not collected by default

- Raw form input values.
- Passwords, payment data, access tokens, refresh tokens, API keys, cookies, or authorization headers.
- Full URL query values.
- Raw page text or DOM snapshots.
- Session replay, heatmaps, or click recordings.

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

## Logging

Operational logs and metrics must use safe reason codes and counts. They must not include raw event payloads or visitor-sensitive values.
