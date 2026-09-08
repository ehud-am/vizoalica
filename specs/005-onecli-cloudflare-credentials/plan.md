# Implementation Plan: OneCLI Cloudflare Credentials

**Branch**: `005-onecli-cloudflare-credentials` | **Date**: 2026-09-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-onecli-cloudflare-credentials/spec.md`

## Summary

Add an opt-in OneCLI credential provider to Vizoalica's Cloudflare deployment workflow. A new,
typed deployment CLI will load a non-secret deployment profile, validate the selected OneCLI
project, agent, connection, effective grants, and expected Cloudflare account, then execute the
existing Wrangler operations through `onecli run`. It will remove ambient Cloudflare credentials
from the child environment, fail closed on provider or account ambiguity, redact all output, emit a
reviewable plan and short-lived preflight receipt, and append operator-only audit records. Existing
Cloudflare-native deployments remain supported through the same provider interface and current
top-level commands.

## Technical Context

**Language/Version**: TypeScript 5.7 on Node.js 22; POSIX shell only for compatibility entry points

**Primary Dependencies**: Node.js built-in process, filesystem, crypto, and child-process APIs;
existing Ajv validation; OneCLI CLI 2.11 or newer; Wrangler 4.x

**Storage**: Versioned non-secret JSON deployment profile plus operator-only local JSON plan,
preflight receipt, result, and append-only NDJSON audit files; no application datastore changes

**Testing**: Vitest 4 with unit tests for validation/redaction/state transitions, contract tests for
CLI and JSON artifacts, mocked-process integration tests for both credential providers, and
end-to-end smoke validation against non-production OneCLI and Cloudflare connections

**Target Platform**: macOS and Linux operator workstations plus non-interactive Linux CI runners

**Project Type**: Monorepo command-line application and versioned agent skill integrated with the
existing Cloudflare deployment scripts

**Performance Goals**: Local validation and plan generation complete in under two seconds; normal
network-backed preflight completes in under 30 seconds under healthy provider conditions; output is
streamed without retaining unredacted upstream responses

**Constraints**: Vizoalica never receives or persists the raw Cloudflare token; OneCLI mode never
falls back to ambient Cloudflare credentials; account and connection identity must be deterministic;
mutations require a current matching plan and explicit approval; all output and audit fields are
allowlisted; browser instrumentation and deployed runtime behavior remain unchanged

**Scale/Scope**: One credential provider, target account, environment, and deployment identity per
profile; the existing Worker, one D1 database, one R2 bucket, Worker secrets, and migrations; local
and CI identities may use separate profiles and OneCLI grants

## Constitution Check

*GATE: Passed before Phase 0 research and re-checked after Phase 1 design.*

| Principle or gate | Design evidence | Result |
| --- | --- | --- |
| Privacy-minimal analytics | No analytics fields, browser contracts, event history, or retention behavior change. New records contain only operational metadata and have documented retention. | Pass |
| Security, privacy, and abuse resistance | Raw tokens remain in OneCLI; ambient Cloudflare auth is removed in OneCLI mode; grants, target account, revocation, redaction, and failure categories receive negative tests. | Pass |
| Open source and portable interoperability | A small provider interface preserves the Cloudflare-native path and isolates proprietary OneCLI behavior behind an adapter with documented migration and rollback. | Pass |
| Minimal infrastructure and AI-assisted deployment | OneCLI is an existing external dependency, not new hosted Vizoalica infrastructure. The design includes a versioned deployment skill, reviewable plan, explicit approval, validation, and safe audit result. | Pass |
| Human-readable and AI-ready engineering | Versioned schemas, typed adapters, structured failure codes, explicit file ownership, and reproducible commands replace implicit shell state. | Pass |
| Accessible product experience | No graphical interface changes. Human CLI output uses plain language and does not rely on color; machine-readable JSON is available for assistive and automated clients. | Pass |
| Verification and release gates | Unit, integration, contract, security-negative, and end-to-end tests are planned; repository coverage remains above 90% for lines and branches; full quality and security checks remain mandatory. | Pass |
| Human release governance | The deployment skill must stop for human approval, and the release still requires human go/no-go review. | Pass |

### Post-design re-evaluation

Phase 1 keeps every gate satisfied. The data model stores no secret values, the contracts require
allowlisted output and deterministic identity checks, the quickstart includes revocation and
no-fallback tests, and the provider boundary retains the existing portable Cloudflare-native path.
No constitutional exception is required.

## Project Structure

### Documentation (this feature)

```text
specs/005-onecli-cloudflare-credentials/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── deployment-cli.md
│   ├── deployment-profile.schema.json
│   └── deployment-result.schema.json
└── tasks.md
```

### Source Code (repository root)

```text
apps/deploy-cli/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── audit.ts
│   ├── config.ts
│   ├── plan.ts
│   ├── process.ts
│   ├── redaction.ts
│   ├── types.ts
│   ├── commands/
│   │   ├── configure.ts
│   │   ├── preflight.ts
│   │   ├── plan.ts
│   │   ├── apply.ts
│   │   └── verify.ts
│   └── providers/
│       ├── provider.ts
│       ├── cloudflare-native.ts
│       └── onecli.ts
└── tests/
    ├── contract/
    ├── integration/
    └── unit/

.agents/skills/vizoalica-cloudflare-deploy/
└── SKILL.md

deploy/cloudflare/
├── deployment-profile.example.json
├── wrangler.example.toml
└── wrangler.production.toml

scripts/
├── deploy-check.sh
├── deploy-apply.sh
└── deploy-verify.sh

docs/operations/
└── cloudflare.md
```

**Structure Decision**: Add one focused workspace CLI because provider resolution, environment
sanitization, plan receipts, redaction, and audit serialization require typed, directly testable
logic. Existing shell commands remain as thin compatibility entry points. OneCLI-specific behavior
is isolated behind a provider interface, while the repository-owned deployment skill expresses the
human/agent workflow without duplicating credential logic.

## Complexity Tracking

No constitution violations or complexity exceptions are required.
