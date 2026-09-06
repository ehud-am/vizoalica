<!--
Sync Impact Report
Version change: 2.0.0 → 3.0.0
Modified principles:
- I. Privacy-Minimal Analytics → I. Privacy-Minimal Analytics (expanded retention and review rules)
- II. Security and Abuse Resistance by Design → II. Security, Privacy, and Abuse Resistance
- III. Open Standards and Interoperability → III. Open Source and Portable Interoperability
- IV. Cloudflare-First, Low-Cost Operations → IV. Minimal Infrastructure and AI-Assisted Deployment
- V. AI-Ready, Human-Governed Product Data → V. Human-Readable and AI-Ready Engineering
Added sections:
- Accessible Product Experience
- Development Workflow, Verification, and Release Gates
Removed sections: none
Follow-up TODOs:
- Design and implement the Cloudflare deployment skill and agent-safe credential workflow.
- Define additional deployment profiles after the Cloudflare profile is released and validated.
-->
# Vizoalica Constitution

## Core Principles

### I. Privacy-Minimal Analytics
Vizoalica MUST collect, retain, process, and expose only data needed for documented product
analytics purposes. Sensitive information, raw page content, secrets, passwords, payment data,
health data, and unnecessary personal data are forbidden by default. Every new data field MUST
have a documented purpose, retention expectation, access boundary, and privacy review before it is
accepted. Analytics interfaces MUST return aggregates rather than visitor identifiers, raw events,
or raw URL query values unless an explicit, reviewed exception is approved.

Rationale: Product insight must not become a privacy, compliance, or trust liability for site
owners and their users.

### II. Security, Privacy, and Abuse Resistance
Every externally reachable interface MUST be treated as hostile-input infrastructure. Ingestion and
administrative paths MUST validate inputs, reject oversized or malformed payloads, isolate
projects, apply quotas before expensive work, and fail closed for writes while preserving the host
website's normal operation. Authentication, authorization, credential rotation and revocation,
least-privilege access, safe auditability, dependency review, and secure defaults are mandatory
design requirements. Browser-distributed identifiers MUST be treated as public; server secrets and
administrative credentials MUST never be embedded in websites, client bundles, logs, or examples.

Rationale: Analytics endpoints are exposed, high-volume systems. Security failures create data
exposure, abuse, cost amplification, and loss of trust.

### III. Open Source and Portable Interoperability
Vizoalica MUST remain an open-source project with readable source, a clear license, contribution
guidance, and public documentation sufficient for users to deploy, operate, audit, and extend it.
It MUST prefer established open standards and portable interfaces for events, identity,
authorization, consent, exports, and deployment. Proprietary formats or provider-specific behavior
MAY be introduced only with a documented rationale and a compatible export, migration, or adapter
path.

Rationale: An analytics package must be auditable, adaptable, and free from unnecessary vendor
lock-in.

### IV. Minimal Infrastructure and AI-Assisted Deployment
Designs MUST minimize required infrastructure, recurring operational cost, backend code, and
deployment complexity without compromising privacy, security, accessibility, or correctness. The
first supported customer deployment profile is Cloudflare. Additional hosting profiles MAY be
added only when they preserve portable event and storage boundaries and do not require changes to
browser instrumentation or accepted event history.

Deployment MUST be designed as an AI-agent-operable workflow, exposed through a documented,
versioned deployment skill rather than requiring customers to author infrastructure-as-code. The
skill MUST support both agent-assisted CI/CD and supervised manual deployment from concise user
intent, produce a reviewable deployment plan, request only necessary credentials, apply
least-privilege access, validate the deployed system, and report an auditable result. It MUST NOT
silently create resources, expose secrets, or bypass a customer's approval boundary.

Rationale: These rules keep the product cheap and simple to run while making safe deployment
accessible to customers using capable coding agents.

### V. Human-Readable and AI-Ready Engineering
Code, configuration, specifications, tests, and documentation MUST be small in scope, explicit,
well named, consistently formatted, and understandable by a new human contributor without hidden
context. Comments MUST explain non-obvious intent, constraints, security decisions, or tradeoffs;
they MUST NOT restate self-evident code. Public behavior, operational procedures, and safe defaults
MUST be documented alongside their implementation.

The repository MUST be structured for reliable AI-assisted development: specifications and
contracts precede implementation, files have clear ownership, commands are reproducible, and
machine-readable instructions do not contradict human-facing documentation. AI assistance MUST NOT
weaken human accountability, review, explainability, privacy, or authorization boundaries.

Rationale: Clean, minimal code and accurate documentation improve maintenance for both human and
AI contributors while reducing defects and operational burden.

## Accessible Product Experience

All user-facing web interfaces, documentation sites, and generated integration experiences MUST
conform to WCAG 2.2 Level AA before official release. Features MUST be keyboard-operable, provide
semantic structure and accessible names, preserve visible focus, meet contrast and responsive
reflow requirements, and expose clear error and status information without relying only on color.
Accessibility acceptance tests, including automated checks and representative manual keyboard and
assistive-technology checks, MUST accompany material interface changes.

Rationale: Privacy-friendly analytics is only useful when its operation and integration are
available to people with diverse access needs.

## Product & Architecture Constraints

- The embedded website integration MUST never block or break the host website when Vizoalica is
  unavailable, slow, misconfigured, or rate-limited.
- Ingestion MUST apply privacy filtering, cost limits, and abuse controls before expensive
  persistence or downstream fan-out.
- Raw-event storage MUST remain separate from configuration, quota metadata, and queryable
  aggregates. Normal analytics MUST use bounded aggregates rather than unbounded raw-data scans.
- Data models and public event contracts MUST be versioned or explicitly marked experimental and
  MUST support future expansion without a breaking rewrite of accepted history.
- Administrative and analytics clients MAY operate locally, but credentials and secrets MUST stay
  outside browser bundles and the clients MUST use narrow, auditable remote-data interfaces.
- Every supported deployment profile MUST document its cost model, required services, security
  responsibilities, backup/recovery expectations, and removal/teardown procedure.

## Development Workflow, Verification, and Release Gates

- Requirements, architecture decisions, privacy implications, threat model, operational cost, and
  accessibility impact MUST be documented before implementation begins for relevant changes.
- New or modified behavior MUST have automated unit, integration, contract, and end-to-end tests
  appropriate to its risk. Repository-wide automated test coverage MUST remain above 90% for lines
  and branches, excluding only generated code and exclusions documented with a rationale.
- Security-critical paths MUST have negative tests for authentication, authorization, project
  isolation, malformed input, credential exposure, quota enforcement, and failure behavior.
- All changes MUST pass formatting, type checking, linting, dependency/security scanning, and the
  applicable automated test suites before review. Exceptions require a documented owner, expiry,
  and remediation plan.
- Before an official release, maintainers MUST run an alignment review of code, specifications,
  contracts, operational documents, and README; a full testing cycle; and a contrarian QA review
  in which an AI agent acts as a skeptical QA engineer and produces a written QA report.
- A human release owner MUST make the final go/no-go decision after reviewing alignment evidence,
  test results, security findings, accessibility evidence, deployment validation, and the QA
  report. AI agents may recommend but MUST NOT make that release decision.

## Governance

This constitution supersedes informal project practices. Specifications, plans, tasks, code
reviews, deployment skills, release decisions, and documentation updates MUST demonstrate
compliance with these principles.

Amendments require:

1. A written proposal explaining the change and its impact on privacy, security, accessibility,
   cost, open-source interoperability, and deployment portability.
2. An updated Sync Impact Report in this file.
3. Review by a human maintainer before adoption.
4. Semantic versioning of this constitution: MAJOR for incompatible principle removals or
   redefinitions, MINOR for new principles or materially expanded obligations, and PATCH for
   clarifications that do not alter obligations.

Compliance evidence belongs with the relevant specification, plan, pull request, or release
record. Complexity, coverage exclusions, security exceptions, and deferred accessibility work are
invalid unless explicitly approved, time-bounded, and tracked to resolution.

**Version**: 3.0.0 | **Ratified**: 2026-08-15 | **Last Amended**: 2026-09-05
