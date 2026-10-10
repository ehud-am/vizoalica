# Action collection: privacy review

**Status**: Recorded 2026-09-21 for [spec 017](../../specs/017-page-breakdown-and-actions/spec.md)
(FR-011, FR-016, FR-028). This is the review the constitution requires before any new data field is
accepted. It covers what this release adds: actions (clicks on buttons and links), route fragments in
page keys, and the grouping of identifiers in paths.

Each field is judged against the same questions: what is the purpose, what is retained and for how
long, who can see it, and how could it identify a person?

## Decisions

| Field                                  | Decision | Purpose                                         | Retention                                                                                      | Access boundary                                                             | Re-identification risk                                                                                                                                                                                          |
| -------------------------------------- | -------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Action name**                        | Approved | Show which buttons and links are used           | Same as other dashboard aggregates (32 days); raw batches follow the existing raw-batch policy | Aggregates only, project-scoped, operator console, administrator credential | Low to medium. It is the control's own text, redacted and cut at 80 characters. Record numbers under six digits and personal names inside a label are not detected; developers can rename or exclude a control. |
| **Action kind**                        | Approved | Tell buttons, links, and other controls apart   | Same                                                                                           | Same                                                                        | Low. Three fixed values.                                                                                                                                                                                        |
| **Link destination** (origin and path) | Approved | Show where links lead                           | Same                                                                                           | Same                                                                        | Low. No query or fragment; paths are grouped so record identifiers become `:id`; `mailto:` and `tel:` record nothing.                                                                                           |
| **Page key with route fragment**       | Approved | Report each screen of a fragment-routed site    | Same as page paths                                                                             | Same                                                                        | Low. Only a fragment that starts with `/` is kept, its query is dropped, and anchors and sign-in data are ignored.                                                                                              |
| **Identifier grouping in paths**       | Approved | Keep record identifiers out of stored analytics | n/a (it removes data)                                                                          | n/a                                                                         | Reduces risk: identifiers in paths can be personal data and are replaced before storage, in the browser and again at the backend.                                                                               |
| Click position, element selectors, ids | Rejected | Would enable heatmaps and replay                | n/a                                                                                            | n/a                                                                         | Higher, and not needed for the purpose.                                                                                                                                                                         |
| Typed text or field values             | Rejected | None                                            | n/a                                                                                            | n/a                                                                         | Forbidden by the privacy-minimal principle; the SDK never reads them.                                                                                                                                           |

## Rules that hold

1. Action collection is always on for a website running the updated SDK file and has no
   per-website setting. It begins only when the owner deploys that file, and it is honored per
   visitor: nothing is recorded when the site tells the SDK that consent is denied.
2. Developers can exclude any control or area with `data-vizoalica-ignore` and name a control with
   `data-vizoalica-action`.
3. Only buttons, links, and controls that behave like them are eligible. Text inputs, textareas,
   selects, and editable regions are never read, so password, payment, and one-time-code fields
   cannot be captured.
4. The backend re-applies label redaction and path grouping to every event, so it does not rely on
   the browser being honest.
5. The console and the API return aggregates only: counts and distinct-visitor counts, never a
   visitor identifier, session, or raw event. Distinct visitors use the existing keyed digests.
6. Small-count risk: an action name seen by very few visitors could point at one person only if the
   label itself names them. The label rules above and the developer's exclusion are the controls; a
   suppression rule for small counts is not added, because labels are control text rather than
   visitor attributes.

## Known limits

- A record number of fewer than six digits inside a label (a link reading "Order 8841") is kept.
  Name such controls with `data-vizoalica-action`.
- Slugs that identify a record (`/products/blue-widget`) are not recognized as identifiers.

Anything added later needs its own entry here first.
