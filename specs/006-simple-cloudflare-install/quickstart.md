# Validation quickstart

1. Install dependencies with `pnpm install --frozen-lockfile`.
2. Run `pnpm validate`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm coverage`, and `pnpm audit --prod`.
3. Run `pnpm browser-sdk:build`; execute the generated IIFE in a browser-like test and check initialization.
4. Run token Function tests with the actual Worker verifier, including missing/foreign provenance and absent configuration.
5. Rehearse all migrations and the documented seed SQL using a temporary SQLite database.
6. Compile the Pages Function locally without deploying; verify function discovery from example cwd.
7. Follow [installation](../../docs/operations/cloudflare.md) for operator-only live checks. Record Worker health, no pending migrations, website content verification, browser 202 and aggregate counts; do not claim these ran locally.
