# Tasks: `vizoalica deploy`

- [x] D001 Spec, plan, tasks (this folder)
- [x] D002 Package: restore Worker bundle + wrangler template in `scripts/build-package.mjs`, allowlist, package check
- [x] D003 `upsertEnvironment` in `environments/file.ts`; `env add/update` use it; tests
- [x] D004 `deploy/wrangler.ts`, `deploy/plan.ts`, `deploy/explain.ts` + tests
- [x] D005 `deploy/apply.ts` (steps, resume, refusals) + tests against a fake Wrangler
- [x] D006 ~~`deploy/terraform.ts` renderer and writer~~ built, then **removed** (deferred; see spec Story D2)
- [x] D007 `deploy-command.ts`: flags, credential order, confirmation, secret reveal/file, registration + tests
- [x] D008 Wire `deploy` into `main.ts`, `bin.ts`, the checkout CLI, help text
- [x] D009 Docs (deploy guide, environments, README, get-started, llms.txt), CHANGELOG, release notes
- [x] D010 Package check covers `deploy --terraform`; run all gates; update verification log
- [x] D011 Remove the Terraform path from code, tests, docs, package check; `deploy` without `--apply` is a dry run
