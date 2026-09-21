# Contract: What the SDK collects for actions, and how developers control it

Public behavior of the browser SDK once this feature ships. Site developers see it in
`docs/operations/browser-sdk.md`; the privacy review (`docs/privacy/action-collection-review.md`)
cites it.

## Always on

There is no configuration switch for owners and no `data-*` attribute that disables action
collection. Collection starts when the website's SDK file is the updated one. Two things limit it:
the visitor's consent state, and the developer's per-control markings below.

## What is an action

A click, or a keyboard activation (which the browser reports as a click), on:

- `<button>` and `<a href>`;
- `<input>` of type `button`, `submit`, `reset`, or `image`;
- any element with `role` `button`, `link`, `menuitem`, or `tab`.

Not actions: text inputs, selects, textareas, `contenteditable` regions, hovers, scrolls, clicks on
plain text, images, or empty space, and anything inside an embedded frame from another site.

## What is recorded

| Field              | Value                                                                             |
| ------------------ | --------------------------------------------------------------------------------- |
| Page               | The page key ([normalization](./page-path-normalization.md)) and the site's origin |
| Name               | See below; at most 80 characters                                                   |
| Kind               | `button`, `link`, or `other`                                                       |
| Link destination   | For `http` and `https` links only: origin and normalized path                     |
| Visitor and session | The same anonymous identifiers page views use                                     |
| Time, consent state | As every event                                                                    |

## What is never recorded

Typed text, field values, form content, the query or fragment of a link, `mailto:` and `tel:`
addresses, cookies, storage, page content beyond the control's own label, coordinates, or element
identifiers and selectors. Labels are redacted: email addresses become `[email]`, runs of six or more
digits become `[number]`, token-shaped words become `[token]`, and text is cut at 80 characters.

## Naming, in order of precedence

1. `data-vizoalica-action="Start free trial"` on the control.
2. `aria-label`.
3. Visible text (`value` for input buttons).
4. `title`, or the `alt` of an image inside the control.
5. `Unlabeled button`, `Unlabeled link`, or `Unlabeled control`.

## Excluding

```html
<button data-vizoalica-ignore>Delete jane@example.com</button>
<section data-vizoalica-ignore>… nothing inside is recorded …</section>
```

`data-vizoalica-ignore` on a control or on any ancestor prevents recording.

```html
<button data-vizoalica-action="Buy now">🛒</button>
```

## Behavior guarantees

- **Never blocks the page.** The listener is passive and capturing, does bounded work, catches every
  error, and never calls `preventDefault` or `stopPropagation`.
- **No effect on the host when Vizoalica is down:** failures are swallowed as for page views.
- **Duplicate suppression:** the same page, name, kind, and destination within 500 ms is recorded once.
- **Rate cap:** at most 100 actions per rolling minute per page load.
- **Consent:** when `consentState` is `analytics-denied`, no actions and no in-page navigation views
  are recorded. The consent state travels on every event.
- **Own batches:** actions are sent separately from page views and custom events, and a batch
  rejected with `400` or `413` is dropped rather than retried.

## In-page navigation (page views)

A page view is recorded on load, and again when the visitor moves to a page with a different page key
through `history.pushState`, the browser's back or forward buttons (`popstate`), or a `hashchange`.
`replaceState` counts too when it changes the page key (a redirect). Navigating to the page you are already on is not a new view.
