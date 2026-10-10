# Contract: Snippet / integration response (local operations API)

Additive changes to the response of the snippet route (`apps/local-ops-api/src/routes/snippet.ts`). Existing fields stay.

- `modes[static].snippet`: the short embed (src `/vizoalica.js`, `data-endpoint`, `data-source`). New optional field `customize`: the explicit form with every default written out (the current tag).
- `modes[dynamic].config`: emits only non-default values; `cloudflare.repoVariables` lists only variables without a default; a new `cloudflare.defaults` array names the ones omitted, for the "what's assumed" line.
- `cloudflare.summary`: `{ publicValues: number, secrets: number }` used by the console to state the count up front.
- `cloudflare.starterWorkflowYaml`: works at the repository root without editing; `site-directory` omitted when the site is at the root, and the guidance names the single edit otherwise.
- `cloudflare.accountLookupCommand`: one command that prints the account ID and Pages project names.
- Reachability route: returns one of the check result codes in data-model.md plus a `nextAction` sentence.

Compatibility: consumers reading the old fields still work; `html` legacy field kept.
