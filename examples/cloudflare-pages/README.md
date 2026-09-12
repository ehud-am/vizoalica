# Vizoalica Pages example

Run the complete [US3 website journey](../../docs/operations/pages.md) once for each website. Copy
this folder to a separate website directory, register that website, fill in its public settings,
build/copy the SDK, and set the Pages signing secret. Do not deploy this unconfigured directory or
reuse another website's source identifiers.

- `functions/vizoalica/ingest-token.ts`: scoped five-minute token endpoint.
- `public/index.html`: keyboard-accessible, consent-before-load test page.
- `public/_routes.json`: run Functions only for the token endpoint.
- `wrangler.example.toml`: public configuration; copy to `wrangler.toml` in your working copy.

Keep signing and administrator secrets out of this folder. Only the signing secret belongs in
Pages' encrypted secret configuration. The administrator secret stays with the Worker and local
client. On an existing website, merge configuration/routes rather than overwriting them.
