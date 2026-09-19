# Security policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately through this repository's GitHub Security
Advisories page by choosing **Report a vulnerability**. Do not open a public issue, discussion, or
pull request containing exploit details, credentials, private analytics data, or deployment
configuration.

Include the affected release, impact, reproduction steps, and any suggested mitigation. Redact
Worker URLs, account identifiers, tokens, secrets, proxy configuration, event payloads, and visitor
data unless a maintainer explicitly requests them in the private advisory.

Maintainers will acknowledge a complete report as soon as practical, validate it privately, and
coordinate remediation and disclosure. Please do not test against installations you do not own or
have explicit permission to assess.

## Supported versions

Security fixes target the latest published release. Self-hosting operators should update to the
latest release using the update procedure in the [backend guide](docs/operations/cloudflare.md#update-an-existing-backend)
and follow any upgrade notes in its changelog entry. Older releases may receive
a fix only when maintainers explicitly announce one.

## Credential response

If any real credential enters Git history, logs, an issue, or a shared message, revoke or rotate it
at its provider immediately. Removing text from the latest commit is not sufficient because Git
history and external caches may retain it.
