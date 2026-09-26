# Contract: Embed defaults (browser SDK)

Applies to `packages/browser-sdk/src/embed.ts` and `dynamic-config.ts`.

1. `configFromScript` requires `data-endpoint` and `data-source` (unchanged). Everything else is optional.
2. `data-token-url` absent → token URL `/vizoalica/ingest-token`, fetched same-origin. `data-token-url="none"` → no token provider (unsigned demo). Any other value → used as today.
3. `data-consent` absent → `unknown` (unchanged). `data-auto-page-view` absent → `true` (unchanged).
4. `data-project` absent → event carries no project field; the backend attributes the event from the source.
5. A token request that fails or returns non-OK yields no token and never throws into the host page.
6. `validateDynamicConfig` accepts a document without `data-project`, `data-token-url` and `data-consent`, filling the defaults above. A document that has them is validated exactly as before (same-origin token URL, safe identity pattern, http only for localhost).
7. Generic loader copies only the attributes that are present.

Negative tests: token endpoint 404 → events still sent unsigned, no exception; `data-token-url="none"` → no fetch; non-local `http` endpoint → refused; oversized/odd `data-source` → refused as today.
