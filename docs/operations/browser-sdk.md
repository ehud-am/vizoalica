# Browser SDK

This is the advanced SDK reference. For a complete registration, trusted token issuer, deployment,
consent, accepted-event check, and removal flow, follow [website activation](pages.md) once per
website.

Build both standalone assets with `pnpm browser-sdk:build`, then host
`packages/browser-sdk/dist/vizoalica.js` and, when using dynamic configuration,
`packages/browser-sdk/dist/vizoalica-loader.js` on your **website**. The ingestion Worker does not
serve these files.

## Choose one installation mode

The console provides exactly two options, which its Install page presents as **Paste a snippet**
(static snippet) and **GitHub → Cloudflare Pages** (dynamic configuration). Do not enable both on
one page.

- **Static snippet** is the compatibility path. It embeds `src`, `data-endpoint`, `data-source`,
  `data-project`, `data-token-url`, and `data-consent` directly in website-specific markup.
- **Dynamic configuration** uses the byte-identical generic markup below on every website. The
  loader reads the six public values from a versioned, same-origin JSON response. Cloudflare Pages
  can map plaintext environment variables through the included Function; other hosts can use a
  function, application route, configuration service, or generated public JSON asset.

```html
<script async src="/vizoalica-loader.js"></script>
```

The dynamic host must serve `GET /vizoalica/config.json` as `application/json` with
`Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. Version 1 contains only `version`
and the six fields above. Missing, partial, malformed, cross-origin token, insecure production, or
unsupported configuration fails closed without loading the SDK or affecting the host page.

## Recommended embed

Use one async script tag with your actual Worker URL and public identifiers. Insert it only after
analytics consent is granted. The SDK records `data-consent`; the attribute is not itself a
consent gate.

```html
<script
  async
  src="/vizoalica.js"
  data-endpoint="https://analytics.example.com/v1/events:batch"
  data-source="public_source_key"
  data-project="project_id"
  data-token-url="/vizoalica/ingest-token"
  data-consent="analytics-granted"
></script>
```

The script reads its own `data-*` attributes and initializes itself. By default it sends a page-view event and exposes the client as `window.vizoalica`.

Optional custom event:

```html
<script>
  window.vizoalica?.track('signup_click', {
    properties: {
      plan: 'pro'
    }
  });
</script>
```

## Data attributes

| Attribute             | Required    | Description                                                                   |
| --------------------- | ----------- | ----------------------------------------------------------------------------- |
| `data-endpoint`       | Yes         | Ingestion endpoint, usually `/v1/events:batch`.                               |
| `data-source`         | Yes         | Public source key used for routing. This is not a secret.                     |
| `data-project`        | Recommended | Project identifier to include on client-built events.                         |
| `data-token-url`      | Production  | Same-origin endpoint that returns a short-lived ingest token.                 |
| `data-consent`        | Recommended | Consent state such as `analytics-granted`, `analytics-denied`, or `unknown`.  |
| `data-auto-page-view` | No          | Set to `false` to disable automatic page views, including in-page navigation. |

## Pages and in-page navigation

A page is named by its **page key**: the path, plus the route after `#` for sites that show
different screens without loading a new address.

| Address                                 | Page key             |
| --------------------------------------- | -------------------- |
| `https://example.com/pricing?plan=pro`  | `/pricing`           |
| `https://example.com/#/pricing`         | `/#/pricing`         |
| `https://example.com/app#/orders/8841`  | `/app#/orders/:id`   |
| `https://example.com/docs#section-2`    | `/docs` (an anchor)  |
| `https://example.com/cb#access_token=x` | `/cb` (sign-in data) |

Only a fragment that starts with `/` is a route, and its query is dropped. Anchors, tokens, and
any other fragment are ignored, so sign-in data in an address is never recorded.

A page view is sent when the page loads, and again when a visitor moves to a page with a
**different page key** by `history.pushState`, `history.replaceState` (a redirect), the back and
forward buttons, or a change of the fragment. Going to the page you are already on, or changing
only the query, is not a new view. Single-page apps and fragment-routed sites therefore report each
screen instead of one `/` for everything.

`data-auto-page-view="false"` turns off automatic page views, and in-page navigation views with
them. For a module integration, `autoNavigation` overrides that on its own. When consent is
explicitly `analytics-denied`, in-page navigation views are not sent (the first page view keeps its
existing behavior).

## How pages are grouped

Pages that differ only by an identifier are one page, and the identifier is never stored. The
browser replaces identifier-shaped path segments with `:id` before sending, and the backend applies
the same rule again, so older SDK files and other clients are covered too.

| A segment that is...                                                        | becomes | Example                                |
| --------------------------------------------------------------------------- | ------- | -------------------------------------- |
| digits only                                                                 | `:id`   | `8841`, `2`                            |
| a UUID                                                                      | `:id`   | `3f2b8c1e-5d4a-4a37-9c1b-0e7d2a6f9b10` |
| hexadecimal, 16 or more characters                                          | `:id`   | `5f2b8c1e5d4a4a37`                     |
| a ULID                                                                      | `:id`   | `01ARZ3NDEKTSV4RRFFQ69G5FAV`           |
| a token: 20 or more letters, digits, `_`, `-`, with upper, lower, and digit | `:id`   | `V1StGXR8_Z5jdHi6B-myT`                |
| contains `@`                                                                | `:id`   | `jane@example.com`                     |
| ordinary words, slugs, versions, file names                                 | kept    | `pricing`, `my-first-post`, `v2`       |
| a year followed by a month, then optionally a day                           | kept    | `/blog/2026/09/launch`                 |

So `/orders/8841` and `/orders/8842` are both `/orders/:id`, and `#/orders/8841?tab=items` is
`/#/orders/:id`. Things to know:

- A short number is grouped too: `/page/2` becomes `/page/:id`.
- A date-shaped run is kept, so an order and item such as `/orders/2026/12` are kept as written.
- Readable slugs that identify a record (`/products/blue-widget`) cannot be recognized and stay
  separate. The long tail collapses into "Other" in the console.
- Events recorded before this release keep the paths they were recorded with.

## Actions: clicks on buttons and links

The SDK records an **action** when a visitor clicks or presses Enter or Space on a `button`, an
`a[href]`, an `input` of type `button`, `submit`, `reset`, or `image`, or an element with role
`button`, `link`, `menuitem`, or `tab`. It is always on: there is no setting to disable it, and the
embed script has no attribute for it. What limits it is the visitor's consent state and the two
markings below.

Each action records the page key, a name, a kind (`button`, `link`, or `other`), and, for
`http` and `https` links, the destination's origin and path (grouped like any page, with no query).
The name is, in order: `data-vizoalica-action`, `aria-label`, the visible text (or `value` for input
buttons), `title`, the `alt` of an image inside, and finally `Unlabeled button`, `Unlabeled link`, or
`Unlabeled control`.

Names are made safe before they leave the browser, and again at the backend: whitespace is
collapsed, email addresses become `[email]`, runs of six or more digits (allowing spaces, dashes,
and dots) become `[number]`, token-shaped words become `[token]`, and the name is cut at 80
characters. Record numbers shorter than that, such as the `8841` in a link reading "Order 8841",
are not detected. Give such a control an explicit name with `data-vizoalica-action`.

**Never recorded:** anything typed, the value of any field, text inputs, textareas, selects,
editable regions, clicks on plain text, images, or empty space, anything inside an embedded frame
from another site, the query or fragment of a link, `mailto:` and `tel:` addresses, cookies, and
positions or element identifiers. There is no session replay or heatmap.

An action belongs to the page where the click began: a single-page router that navigates in response
to the click does not move it to the destination page. The same control clicked again within 500 ms counts once, and at most 100 actions are recorded per
minute per page load. Actions are sent in their own requests, so a backend that does not yet know
about them can never delay or lose page views: a batch the backend rejects as invalid or too large
(HTTP 400 or 413) is dropped rather than retried forever. Upgrade the backend before the SDK file.

## Naming and excluding controls

```html
<!-- Name a control whose label is unclear or contains a record number. -->
<button data-vizoalica-action="Buy now">🛒</button>

<!-- Never record this control, or anything inside this area. -->
<button data-vizoalica-ignore>Delete jane@example.com</button>
<section data-vizoalica-ignore>
  <button>Nothing in here is recorded</button>
</section>
```

`data-vizoalica-ignore` on a control or any ancestor wins over a name. Both markings are read at
click time, so they can be added or removed while the page is open.

## Guarantees

- Loading and delivery are non-blocking.
- Events are held in a bounded in-memory queue.
- Delivery failures are swallowed so analytics never breaks the host website. Click handling is
  passive and never changes or delays a click, and history wrappers never throw into your router.
- Query values, fragments that are not routes, identifiers in paths, referrers, and custom
  properties are minimized before delivery. Action names never contain typed text or field values.
- Browser code can receive short-lived ingest tokens, but must never receive signing secrets.
- Dynamic loading initializes at most once and never falls back to another project, source, or
  endpoint.

For CSP-restricted sites, allow the website-hosted SDK/loader in `script-src`, the analytics Worker
in `connect-src`, and the same-origin config/token routes in `connect-src 'self'`. Switching modes
requires removing the old load path, deploying the new assets/configuration, reviewing the
effective public values, and verifying an accepted consented event. If dynamic configuration is
unavailable, keep the website usable, correct all six values, and redeploy; do not add defaults.

## Module usage for advanced integrations

```ts
import { init } from '@vizoalica/browser-sdk';

const client = init({
  endpoint: 'https://analytics.example.com/v1/events:batch',
  sourceKey: 'public_source_key',
  projectId: 'project_id',
  tokenProvider: async () => fetch('/vizoalica/ingest-token').then((r) => r.text()),
  consentState: 'analytics-granted'
});

client.track('signup_click', { properties: { plan: 'pro' } });

// Stop observing navigation and clicks (for example when a single-page app tears down).
client.stop();
```

`init` also accepts `autoNavigation` and `autoActions` (both default to on) for programmatic use;
the embed script deliberately offers no way to switch actions off.

Production ingestion should use short-lived server-issued tokens; unsigned ingestion is only for explicitly configured demo/development mode.

For the Cloudflare profile, set `endpoint` to the deployed Worker URL ending in `/v1/events:batch` and provide the short-lived token through `tokenProvider`.
