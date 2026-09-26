# Data Model: Simpler Website Management and Install

No stored data changes. These are the console-side and configuration shapes the feature adds or changes.

## Scope (console state)

| Field | Notes |
|-------|-------|
| environment | Name of the selected environment; from the environments list. |
| project | Id of the selected project within that environment; must exist in the environment's project list. |
| website | Optional per-page filter; not part of the header group. |
| range | Optional per-page time range. |

Rules: environment change reloads the session; the project is kept only if present in the new list (else first, with a notice). Pages other than Projects read the pair; none render a project picker.

## Embed (generated, not stored)

| Attribute | Required | Default when omitted |
|-----------|----------|----------------------|
| script src | yes | site-relative `/vizoalica.js` in generated output |
| data-endpoint | yes | none (cannot be inferred) |
| data-source | yes | none (the website's public key) |
| data-project | no | derived by the backend from the source |
| data-token-url | no | `/vizoalica/ingest-token`; `none` = unsigned demo |
| data-consent | no | `unknown` |
| data-auto-page-view | no | `true` |

Compatibility: every previously generated tag and configuration document remains valid.

## Website input (form)

| Field | Rule |
|-------|------|
| address(es) | One or more pasted addresses → exact origins (R9); shown before saving; at least one. |
| name | Optional; defaults to the first origin's host. Max 120 characters as today. |
| project | Read-only, taken from scope; not submitted from the form as a choice. |
| also allow www | Optional convenience that adds the counterpart origin. |

## Install check result

One of: `working`, `sdk-file-missing`, `token-endpoint-missing`, `token-endpoint-rejecting`, `origin-not-allowed`, `no-event-yet`. Each maps to exactly one next-action sentence.

## Health view

Two sections: `backend` (console version, worker version, schema version, database and storage state; environment-wide) and `websites` (per website in the scoped project, unchanged).
