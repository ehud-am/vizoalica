# Plan: `vizoalica deploy`

Spec: [spec.md](./spec.md). Builds on the environments file and verification from feature 018 Revision 3.

## Design

Code lives in the packaged CLI, `apps/cli/src/deploy/`, and reuses `@vizoalica/ops-core` (names, secret
generation, config rendering, Wrangler output parsers) and `apps/local-ops-api/src/environments/*` (file,
verify, vault types). Restores, in CLI form, the first-install sequence of the console engine removed in
Revision 3 (still in git history).

| File | Responsibility |
| --- | --- |
| `deploy/wrangler.ts` | Pinned Wrangler runner (no shell, credential via env); OneCLI-wrapped runner; `VIZOALICA_WRANGLER` override |
| `deploy/plan.ts` | Names and resources for `<name>`; the text shown before confirming |
| `deploy/explain.ts` | Turns Wrangler/Cloudflare output into "what happened, what to do" |
| `deploy/apply.ts` | The ordered steps (option 1), with `--resume`; returns address and generated secrets |
| `deploy-command.ts` | Flags, plan-or-apply, credential resolution, confirmation, secret reveal, environment registration |

Environment registration uses one new helper in `environments/file.ts` (`upsertEnvironment`) shared with
`vizoalica env add`, so the "never drop a broken entry" rule lives in one place.

### Terraform (deferred)

Specified and built, then removed (see spec, Story D2). Recorded here so it can return: Cloudflare provider `~> 5`
resources `cloudflare_d1_database`, `cloudflare_r2_bucket`, `cloudflare_workers_script` (bindings from
`random_password` secrets), `cloudflare_workers_cron_trigger`, `cloudflare_workers_script_subdomain`, optional
`cloudflare_workers_custom_domain`, plus a `terraform_data` step running a pinned Wrangler for migrations. Before
it returns: apply it once on a scratch account, pin the tested provider version, and decide against a
Wrangler-native export.

### Packaging

Restore the prebundled Worker and `wrangler.template.toml` in `scripts/build-package.mjs`; allow
`dist/worker/*` in the package allowlist; keep `dist/schema/*.sql`.

### Delivery order

1. Spec/plan/tasks. 2. Packaging restored. 3. `upsertEnvironment`. 4. Runner, plan, explain. 5. Apply.
6. (Terraform renderer, removed.) 7. Command + main wiring + checkout wiring. 8. Tests throughout. 9. Docs, changelog,
package check. 10. Gates.

## Risks

- Terraform provider attribute names could drift: pinned `~> 5.0`, structure-tested, documented as unvalidated
  until run once by a person.
- A partial apply leaves resources: `--resume` continues; nothing is deleted automatically.
