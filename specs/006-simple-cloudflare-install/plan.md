# Implementation Plan: Simple Cloudflare installation

**Branch**: existing checkout | **Date**: 2026-09-09 | **Spec**: [spec.md](spec.md)

## Summary

Ship patch 0.3.1 with a numbered default installation, a copyable Pages project, a standalone SDK build, content-aware verification, complete local snippets, and corrected OneCLI process initialization/timeouts. Preserve the existing same-origin fix. Keep upstream Pages proxy limitations explicit.

## Technical Context

**Language/Version**: TypeScript, Node.js 22+, pnpm 9, Markdown.
**Primary Dependencies**: existing Wrangler 4.127.1, Web Crypto, esbuild for IIFE bundling.
**Storage**: existing D1/R2; no new schema or services.
**Testing**: Vitest, TypeScript, ESLint, Prettier, local bundle checks and SQLite migration rehearsal.
**Target Platform**: Cloudflare Worker/Pages and loopback macOS/Linux clients.
**Project Type**: documentation patch with executable examples and narrow bug fixes.
**Performance Goals**: static SDK served without Function invocation; bounded five-minute token; 60-second reads, 120-second dry run, 300-second migration/deploy limits.
**Constraints**: no real credentials, no remote mutation, preserve uncommitted user fixes; no proxy bypass.
**Scale/Scope**: all 18 incident findings; default native provisioning with optional OneCLI local client and advanced Worker profile.

## Constitution Check

Pre-design and post-design PASS: existing data model, no new personal data; secret held server-side; fixed project/source/origin token scope; negative authentication tests; explicit credential choice; no paid services added. Consent stays unknown unless granted by the visitor. Example markup is semantic and keyboard usable. No official release publication or live deployment is part of this work. Full local validation and skeptical QA evidence precede handoff; live evidence is identified separately.

## Project Structure

- `docs/operations/cloudflare.md`: first-run sequence and advanced profile link.
- `docs/operations/pages.md`: website recipe, verification and deployment modes.
- `docs/operations/local-analytics.md`: exact vault fields and host gateway.
- `docs/operations/troubleshooting.md`: symptom/fix table and all 18 dispositions.
- `examples/cloudflare-pages/`: public assets, scoped Function and non-secret config example.
- `scripts/build-browser-sdk.mjs`, `scripts/verify-website.ts`: reproducible build/verification.
- `apps/local-ops-api/src/`: enrich snippet using configured Worker URL.
- `apps/deploy-cli/src/providers/`: placeholder only in wrapped Wrangler and operation timeouts.
- existing test directories: negative cases and cross-component verification.

## Complexity Tracking

No new service, framework, database or proxy implementation. esbuild is already a transitive dependency; declare it directly for reproducibility. Example Function uses Web Crypto without a runtime package.

## Validation-driven security update

The full dependency audit identified existing high advisories in sharp <0.35.4 and js-yaml <4.3.2. Apply bounded overrides only to vulnerable versions, retaining the tested Wrangler version; reinstall and rerun full validation/audit. This is remediation under T017, not a deployment feature.
