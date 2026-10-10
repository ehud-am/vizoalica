# Public repository readiness

Complete this checklist before changing repository visibility. Publishing source and deploying an
operator installation remain separate actions.

## Source and history

- [ ] Run a current secret scanner against every reachable Git commit, for example
      `gitleaks detect --source . --config .gitleaks.toml` (the config allows the reviewed base64
      example files embedded in the reusable workflow, and nothing else).
- [ ] Check commit author and committer names and emails (`git log --format='%an <%ae>' | sort -u`)
      are ones you are happy to publish; they are permanent once the history is public.
- [ ] Scan the exact tracked and untracked-but-publishable tree after release metadata is final.
- [ ] Confirm `.env`, `.dev.vars`, Wrangler production configuration, deployment profiles,
      receipts, audit logs, local console files, generated SDK output, coverage, and browser reports
      are ignored and untracked.
- [ ] Search for local home paths, private hostnames, account identifiers, customer data, email
      addresses, and realistic credentials in source, tests, docs, fixtures, images, and metadata.
- [ ] Rotate any credential that was ever exposed; deleting it from the latest tree is insufficient.

## Project policy

- [ ] Confirm `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, README, changelog, fresh-deployment
      boundary, baseline guidance, and release notes match the release.
- [ ] Confirm the private vulnerability-reporting route works before inviting reports.
- [ ] Review third-party asset and dependency licensing.

## GitHub controls

- [ ] Require the `Verify and browser-test` CI check on the default branch.
- [ ] Require pull-request review and block force pushes/deletion on the default branch.
- [ ] Enable Dependabot alerts and security updates.
- [ ] Enable secret scanning and push protection. GitHub provides secret scanning automatically for
      public repositories, but the settings should still be verified after the visibility change.
- [ ] Enable code scanning/default CodeQL setup where available.
- [ ] Review collaborators, deploy keys, webhooks, Actions secrets, environments, Pages settings,
      forks, discussions, and issue templates before changing visibility.

## Publication boundary

- [ ] Read GitHub's current visibility-change warnings in the repository settings.
- [ ] Confirm that making the complete Git history, issues, pull requests, releases, and repository
      metadata public is intended.
- [ ] Change visibility only as a separate, deliberate owner action after the release checks pass.
- [ ] Immediately verify the public anonymous view, release assets, security policy, CI status,
      branch protection, secret scanning, and push protection.
