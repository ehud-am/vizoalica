# Installation contracts

- `pnpm browser-sdk:build`: emits `packages/browser-sdk/dist/vizoalica.js`, an IIFE usable by an async script tag.
- `GET /vizoalica/ingest-token`: Pages Function returns text/plain, no-store, five-minute HS256 token; rejects wrong origin/method and missing configuration; accepts same-origin GET provenance through Origin or Referer.
- `pnpm website:verify -- <website-origin> <project-id> <source-id>`: requires JavaScript MIME/body, token MIME/compact JWT/header/audience/scope/fixed claims/lifetime; exits nonzero on mismatch and never logs token.
- Local snippet response uses local configuration for Worker endpoint, first allowed website origin for hosted SDK, source public key and route project ID; HTML attributes escaped; consent unknown.
- OneCLI inspection environment remains stripped; only wrapped Wrangler receives CLOUDFLARE_API_TOKEN=onecli-managed. Read operations 60s, bundle dry run 120s, migration and deploy 300s. No automatic retry of mutations.

The local integration response also includes projectId and sourceId for the console installation worksheet.
