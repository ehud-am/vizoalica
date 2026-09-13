# Data Model: Project-First Console and Website Setup

## Existing persisted entities

### Project

The existing project remains the persisted ownership, authorization, and analytics-isolation
boundary. This feature adds no project columns or lifecycle states.

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Stable, non-empty identity; used for all project-bound routes |
| `name` | string | Existing validated display name; names are not treated as identity |
| `websiteCount` | non-negative integer, optional | Safe derived count for console presentation |
| `available` | derived boolean | True only while returned by the current authorized project list |

Relationships:

- A project owns zero or more websites.
- A website belongs to exactly one project.
- A current project context may point to at most one available project.

### Website

The existing website/source record remains unchanged in storage.

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Stable source identity, unique within its project |
| `projectId` | string | Required existing project; immutable ownership relationship |
| `name` | string | Existing validated display name |
| `publicSourceKey` | string | Public routing value; never described as a secret |
| `allowedOrigins` | string array | At least one exact validated HTTP(S) origin |
| `status` | `active \| disabled \| deleted` | Existing collection lifecycle |

## Console-only state

### Current Project Context

| Field | Type | Rules |
| --- | --- | --- |
| `projectId` | string or empty | Must match an available project before it scopes a view |
| `origin` | `startup \| projects-view \| direct-action \| post-create` | Explains how browsing context was selected |

Transitions:

```text
empty --first available project--> selected
empty --operator selection/create--> selected
selected --operator selection--> selected(other)
selected --project unavailable--> first available or empty
```

Changing context clears or invalidates child website and analytics state before replacement data is
shown. Context selection is never sufficient confirmation for website creation.

### Website Creation Draft

| Field | Type | Rules |
| --- | --- | --- |
| `projectId` | string | First required field; initialized empty; must be available at submission |
| `name` | string | Required and validated by existing rules |
| `allowedOrigins` | string array | Required and validated by existing origin rules |
| `submissionState` | `editing \| submitting \| succeeded \| failed` | Only success clears the draft |

Transitions:

```text
editing --valid submit--> submitting --created--> succeeded
editing --invalid submit--> editing
submitting --project unavailable/request failure--> failed --edit/retry--> editing
```

No website or successful audit record exists unless the server accepts the nested project-bound
creation request atomically.

## Installation guidance entities

### Installation Guidance

Safe, non-persisted output of the local operations API for one website.

| Field | Type | Rules |
| --- | --- | --- |
| `projectId` | string | Must equal the route project |
| `sourceId` | string | Must equal the route website/source |
| `publicSourceKey` | string | Taken from validated remote metadata |
| `allowedOrigins` | string array | Validated exact origins from remote metadata |
| `modes` | two-element tuple | Exactly `static`, then `dynamic`; IDs are unique |
| `privateSetup` | object | Status/requirements only; contains no private value |

### Static Installation Mode

| Field | Type | Rules |
| --- | --- | --- |
| `id` | literal `static` | Discriminator |
| `snippet` | string | Existing fully resolved HTML, byte-for-byte compatible |

### Dynamic Installation Mode

| Field | Type | Rules |
| --- | --- | --- |
| `id` | literal `dynamic` | Discriminator |
| `snippet` | string | Constant same-origin loader markup across websites |
| `configUrl` | string | Constant same-origin `/vizoalica/config.json` |
| `config` | Dynamic Configuration v1 | Complete preview of six public values |
| `cloudflare` | Cloudflare Guidance | Public vars plus ordered review/deploy/verify instructions |

### Dynamic Configuration v1

| Field | Type | Validation |
| --- | --- | --- |
| `version` | literal `1` | Required; unknown versions fail closed |
| `src` | URL/path string | HTTP(S); production external URLs require HTTPS |
| `data-endpoint` | URL string | Absolute HTTP(S); production requires HTTPS |
| `data-source` | string | Required public source key; bounded safe syntax/length |
| `data-project` | string | Required project ID; bounded safe syntax/length |
| `data-token-url` | URL/path string | Resolves to the website's own origin |
| `data-consent` | consent enum | Existing accepted consent state; no arbitrary value |

The record is all-or-nothing. It contains no administrator credential, signing secret, deployment
credential, issued token, visitor identifier, or analytics event.

### Cloudflare Guidance

| Field | Type | Rules |
| --- | --- | --- |
| `publicVariables` | ordered key/value map | Six explicit non-secret environment bindings |
| `targetInputs` | object | Pages project, environment, branch, site directory, output directory |
| `steps` | ordered array | Inspect, configure, review, exercise, deploy, verify |
| `commands` | ordered string array | Copyable only after required target inputs are resolved |
| `warnings` | string array | Public-value notice, merge-not-overwrite, secret separation, mode switch |

### Workspace Context

| Field | Type | Rules |
| --- | --- | --- |
| `label` | literal `Local workspace` | Visible and accessible status name |
| `localBoundary` | string | Console UI and credential-holding loopback service run locally |
| `remoteBoundary` | string | Selected backend and analytics storage may be remote |

This is explanatory UI state only and contains no backend coordinates or credential status.

