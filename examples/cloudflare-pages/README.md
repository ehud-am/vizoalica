# Vizoalica Pages example

Follow the [complete website recipe](../../docs/operations/pages.md). Copy this folder to a separate
website directory, fill in its public settings, build/copy the SDK and set the Pages signing secret.
Do not deploy this unconfigured directory.

- `functions/vizoalica/ingest-token.ts`: scoped five-minute token endpoint.
- `public/index.html`: keyboard-accessible, consent-before-load test page.
- `public/_routes.json`: run Functions only for the token endpoint.
- `wrangler.example.toml`: public configuration; copy to `wrangler.toml` in your working copy.

Keep signing and administrator secrets out of this folder. Only the signing secret belongs in
Pages' encrypted secret configuration. The administrator secret stays with the Worker and local
client. On an existing website, merge configuration/routes rather than overwriting them.
