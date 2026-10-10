# Research: Project-First Console and Website Setup

## Decision: Preserve one browsing context and require mutation-time project confirmation

**Decision**: Add Projects as a primary console view. Continue to keep one current project in the
application shell for browsing, but initialize the create-website project's required dropdown to
no selection and submit its chosen ID directly.

**Rationale**: The current console already scopes analytics and website reads by `projectId`, and
the Worker rejects source creation for a missing project. Separating browsing context from explicit
mutation confirmation provides the requested safety without changing the D1 model or remote API.

**Alternatives considered**:

- Treat the current project as implicit website ownership: rejected because it does not ask the
  first required question and is vulnerable to stale context.
- Add project rename and deletion: rejected because the request is about first-class navigation
  and gated website creation, while lifecycle semantics would require new storage, audit, and
  retention decisions.

## Decision: Offer a backward-compatible static mode and a versioned dynamic mode

**Decision**: Return exactly two modes from the existing installation endpoint. Static mode keeps
the current resolved script markup. Dynamic mode returns one constant same-origin loader snippet,
a `GET /vizoalica/config.json` contract, a public-value preview, and hosting instructions.

**Rationale**: Existing users retain a zero-migration path. The JSON document makes dynamic values
easy to validate and portable, while a small loader can translate them into the attributes already
understood by the SDK. JSON is safer and easier to audit than generated executable configuration.

**Alternatives considered**:

- Replace static mode with dynamic mode: rejected because it breaks the working flow and adds a
  runtime dependency for sites that do not need it.
- Add configuration behavior directly to the existing SDK script tag: rejected because the
  browser must resolve that tag's `src` before the SDK can read configuration.
- Return executable configuration JavaScript: rejected because it expands the script-execution
  surface and is less portable and testable than data-only JSON.

## Decision: Use a same-origin loader and all-or-nothing validation

**Decision**: The generic dynamic snippet loads `/vizoalica-loader.js`. The loader requests the
same-origin versioned JSON document without cache reuse, validates every required value, then
creates exactly one existing SDK script. Any fetch, parsing, validation, scope, or load error is
contained and produces no SDK client or event.

**Rationale**: Same-origin paths fit the existing self-hosted website model, minimize CSP changes,
and avoid cross-origin configuration. Complete validation prevents mixed or stale project/source
state and preserves the constitution's fail-closed, host-site-safe requirements.

**Alternatives considered**:

- Default missing values from a global backend: rejected because a wrong-project fallback is more
  harmful than missing analytics.
- Cache configuration indefinitely: rejected because project, endpoint, and consent-related
  changes must not leave an unbounded stale configuration.

## Decision: Treat the six dynamic values as public configuration

**Decision**: Map the fields to `VIZOALICA_SDK_SRC`, `VIZOALICA_INGEST_ENDPOINT`,
`VIZOALICA_PUBLIC_SOURCE_KEY`, `VIZOALICA_PROJECT_ID`, `VIZOALICA_TOKEN_URL`, and
`VIZOALICA_CONSENT`. Configure them as non-secret hosting variables. Keep
`VIZOALICA_TOKEN_SECRET`, administrator credentials, and deployment credentials separate and
server-only.

**Rationale**: Every field is returned to and used by browser code. Cloudflare documents plaintext
variables as application configuration and recommends encrypted secrets for sensitive values.
Marking browser-visible values as secrets would create false confidentiality expectations without
preventing disclosure to the browser.

**Alternatives considered**:

- Store all values as Cloudflare Secrets: rejected as misleading and harder to review; encryption
  at rest does not keep a value secret after a function deliberately returns it to a browser.
- Put the token-signing secret in the same JSON: rejected because it would allow arbitrary token
  creation and violate the project's security boundary.

Sources: [Cloudflare Workers environment variables](https://developers.cloudflare.com/workers/configuration/environment-variables/),
[Cloudflare Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/), and
[Cloudflare Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).

## Decision: Generate reviewable Cloudflare guidance, not silent mutations

**Decision**: Display the substituted public-variable block and an ordered Cloudflare sequence:
identity/target inspection, local file review, local exercise, operator-selected Git or Direct
Upload deployment, deployment inspection, config response inspection, and website verification.
Do not run these commands from the local console.

**Rationale**: The constitution requires target visibility and human approval before deployment.
The repository already uses Pages Functions, Wrangler configuration, Direct Upload/Git distinctions,
and `pnpm website:verify`, so the new path can extend proven instructions without adding cloud
credentials to the console.

**Alternatives considered**:

- Make the console mutate Cloudflare directly: rejected because it expands credential scope and
  bypasses the existing deployment approval boundary.
- Use `wrangler pages download config` by default: rejected because it is experimental and can
  overwrite existing site configuration.
- Require Direct Upload: rejected because Git-connected Pages sites must retain their real
  deployment workflow.

Source: [Wrangler Pages command reference](https://developers.cloudflare.com/workers/wrangler/commands/pages/).

## Decision: Use a sticky footer rather than an overlay

**Decision**: Make the console content column fill the available dynamic viewport and push the
footer to the bottom in normal flow. Use a centered inner container and show the footer in ready,
loading, denied, and offline states.

**Rationale**: A CSS-fixed overlay would obscure controls on long pages and at zoom. A sticky
footer occupies the requested stable bottom position on short pages while remaining reachable
after long content.

**Alternatives considered**:

- `position: fixed`: rejected because it requires fragile padding compensation and risks WCAG
  focus/content obstruction.
- Keep the current ordinary margin: rejected because the footer floats above the viewport bottom
  on short pages.

## Decision: Explain rather than merely rename Local workspace

**Decision**: Keep the recognizable label and turn it into an accessible disclosure explaining the
local UI and loopback credential service versus the possibly remote analytics backend and storage.

**Rationale**: The label describes a real security property, but its current noninteractive pill
does not communicate the boundary. The explanation resolves the ambiguity without implying that
analytics data lives on the operator machine.

**Alternatives considered**:

- Remove the indicator: rejected because operators would lose a useful security signal.
- Rename it to “Local data”: rejected because the data may be remote and the statement would be
  inaccurate.

