# Contract: Project-First Console and Dual Website Installation

## Console navigation contract

Primary navigation exposes these destinations in one semantic navigation landmark:

| Destination | Scope | Required behavior |
| --- | --- | --- |
| Projects | All available projects | View, create, select, open selected project's analytics/websites |
| Overview | Current project | Show only current-project analytics and identify that project |
| Websites | Current project | Show only current-project websites and identify that project |

Navigation selection uses `aria-current="page"`. Project identity uses stable IDs even when names
duplicate. When the selected ID is no longer in the authorized project list, all project-bound
child state is cleared before choosing the first available project or the empty state.

Project rename and deletion are not part of this contract.

## Website creation contract

The create form and edit form are behaviorally distinct:

- Create's first focusable form control is a labeled, required project `<select>`.
- The create project value starts empty and includes a non-selectable prompt; current browsing
  context does not pre-confirm ownership.
- Create submits `{ projectId, name, allowedOrigins }` through the existing nested project route.
- The server remains authoritative for whether `projectId` exists and is authorized at submission.
- Failure creates no partial source and clears no entered non-sensitive draft values.
- Success clears the form, changes current context to the submitted project if necessary, refreshes
  that project's websites, and announces both project and website names.
- Edit cannot move a website between projects.
- With no projects, the create form is absent or disabled and an operable action opens Projects.

## Local installation-guidance API contract

`GET /api/projects/{projectId}/websites/{websiteId}/snippet` retains its path, authentication,
loopback-only access, origin checks, project scope, and safe error behavior. Its successful response
becomes:

```json
{
  "projectId": "project-1",
  "sourceId": "source-1",
  "publicSourceKey": "public-key",
  "allowedOrigins": ["https://site.example"],
  "modes": [
    {
      "id": "static",
      "snippet": "<script async src=\"https://site.example/vizoalica.js\" data-endpoint=\"https://analytics.example/v1/events:batch\" data-source=\"public-key\" data-project=\"project-1\" data-token-url=\"/vizoalica/ingest-token\" data-consent=\"unknown\"></script>"
    },
    {
      "id": "dynamic",
      "snippet": "<script async src=\"/vizoalica-loader.js\"></script>",
      "configUrl": "/vizoalica/config.json",
      "config": {
        "version": 1,
        "src": "https://site.example/vizoalica.js",
        "data-endpoint": "https://analytics.example/v1/events:batch",
        "data-source": "public-key",
        "data-project": "project-1",
        "data-token-url": "/vizoalica/ingest-token",
        "data-consent": "unknown"
      },
      "cloudflare": {
        "publicVariables": {
          "VIZOALICA_SDK_SRC": "https://site.example/vizoalica.js",
          "VIZOALICA_INGEST_ENDPOINT": "https://analytics.example/v1/events:batch",
          "VIZOALICA_PUBLIC_SOURCE_KEY": "public-key",
          "VIZOALICA_PROJECT_ID": "project-1",
          "VIZOALICA_TOKEN_URL": "/vizoalica/ingest-token",
          "VIZOALICA_CONSENT": "unknown"
        },
        "requiredTargets": [
          "pagesProject",
          "environment",
          "productionBranch",
          "siteDirectory",
          "outputDirectory"
        ],
        "steps": ["inspect", "configure", "review", "exercise", "deploy", "verify"]
      }
    }
  ],
  "privateSetup": {
    "tokenIssuer": "website-owned",
    "tokenSecretRequired": true
  }
}
```

Compatibility rule: the string in `modes[id=static].snippet` is identical to the complete `html`
value produced before this feature for the same inputs. A transitional top-level `html` alias may
be retained for one release if internal clients need staged migration; it must equal that string
and be documented for removal.

The response never includes `VIZOALICA_TOKEN_SECRET`, an administrator/deployment credential, an
issued token, authorization headers, visitor data, or raw events. All strings are escaped for their
target context before being composed into snippets, configuration blocks, or commands.

## Dynamic public configuration contract

Every dynamic host exposes:

```http
GET /vizoalica/config.json
Accept: application/json
```

Successful response:

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

```json
{
  "version": 1,
  "src": "/vizoalica.js",
  "data-endpoint": "https://analytics.example/v1/events:batch",
  "data-source": "public-key",
  "data-project": "project-1",
  "data-token-url": "/vizoalica/ingest-token",
  "data-consent": "analytics-granted"
}
```

Rules:

- Version 1 requires exactly the six named values plus `version`; additional fields are ignored
  only if they do not weaken validation.
- `src` and `data-endpoint` are HTTP(S); non-local production origins require HTTPS.
- `data-token-url` resolves to the current website origin.
- Project and source values are non-empty and bounded before DOM insertion.
- Consent is one of the event contract's accepted states. It records state but is not permission;
  the host loads dynamic mode only after its consent manager grants analytics.
- Missing bindings, placeholders, invalid URLs, unsupported versions, or partial values return a
  non-success response without a partial configuration body.
- The response is intentionally public and must never contain a secret.

## Generic loader contract

All dynamic sites use byte-identical markup:

```html
<script async src="/vizoalica-loader.js"></script>
```

`/vizoalica-loader.js`:

1. Returns immediately if a Vizoalica loader/SDK initialization guard already exists.
2. Fetches `/vizoalica/config.json` from the current origin with cache reuse disabled.
3. Requires a successful JSON response and validates the full v1 contract.
4. Creates one asynchronous SDK `<script>` and maps the six fields to its source and data
   attributes.
5. Marks initialization before insertion so concurrent/static paths cannot initialize twice.
6. Catches fetch, parse, validation, CSP, and SDK load failures without throwing into the host page.
7. Never applies fallback endpoint/project/source values and never sends an event itself.

## Cloudflare Pages adapter contract

`examples/cloudflare-pages/functions/vizoalica/config.json.ts` maps these non-secret bindings:

| JSON field | Pages binding |
| --- | --- |
| `src` | `VIZOALICA_SDK_SRC` |
| `data-endpoint` | `VIZOALICA_INGEST_ENDPOINT` |
| `data-source` | `VIZOALICA_PUBLIC_SOURCE_KEY` |
| `data-project` | `VIZOALICA_PROJECT_ID` |
| `data-token-url` | `VIZOALICA_TOKEN_URL` |
| `data-consent` | `VIZOALICA_CONSENT` |

The config Function shares `VIZOALICA_PROJECT_ID` with the token issuer. The token issuer also uses
non-secret `VIZOALICA_SOURCE_ID` and `VIZOALICA_SITE_ORIGIN`, plus the only secret in this example,
`VIZOALICA_TOKEN_SECRET`. The config response never returns that secret or the internal source ID.

The existing site's Wrangler file is merged with a generated public `[vars]` block; it is never
overwritten wholesale. The operator then receives this ordered instruction contract:

1. Identify account and exact target with `wrangler whoami` and `wrangler pages project list --json`.
2. Merge and review the public vars, Function, loader asset, and route changes.
3. Exercise the real output locally with `wrangler pages dev`.
4. Stop for explicit approval of project, environment, branch, directory, and diff.
5. Use the site's real Git-connected deployment or `wrangler pages deploy` for Direct Upload.
6. Inspect production deployment metadata, request `/vizoalica/config.json`, run
   `pnpm website:verify`, observe an accepted consented event, and test analytics failure isolation.

Generated commands quote substituted public values and paths for POSIX shells. They never contain a
private value. The signing secret continues to use Wrangler's hidden prompt separately.

## Other hosting providers

A provider adapter is conformant when it serves the same loader asset and v1 JSON response at the
same paths and with the same validation/failure behavior. It may obtain values from runtime
environment variables, an application configuration system, a serverless function, or a generated
static JSON asset. Provider-specific names do not alter the public JSON field names or generic
snippet.

## Installation UI contract

- Expose exactly two keyboard-operable choices named “Static snippet” and “Dynamic configuration.”
- Static is initially selected for compatibility; changing choices performs no cloud mutation.
- Each mode has its own copy action and status announcement.
- Dynamic shows the generic snippet, effective public values, public-variable block, target inputs,
  ordered Cloudflare steps/commands, provider-neutral notes, and private-setup boundary.
- Both modes warn that the host consent manager must grant analytics before load.
- Switching modes warns the operator to remove/disable the other path so initialization occurs once.
- Technical blocks are keyboard-focusable named regions with contained horizontal scrolling.

## Footer and workspace-context contract

- The content column uses normal flow and fills the remaining dynamic viewport; the footer follows
  long content and sits at the bottom edge on short content without overlay.
- A centered inner container exposes `https://vizoalica.dev`,
  `https://github.com/ehud-am/vizoalica`, current calendar year, and the injected version.
- Missing/invalid version renders “Version unavailable,” not `vunknown` or a fabricated release.
- The footer is present in ready, loading, denied, and offline console states.
- “Local workspace” is an operable disclosure with text explaining that the console UI and trusted
  credential-holding loopback service run on this computer while the backend and stored analytics
  may be remote.
- Footer and disclosure meet WCAG 2.2 AA for keyboard, focus, names, reading order, zoom/reflow,
  target size, contrast, and focus-not-obscured behavior.

