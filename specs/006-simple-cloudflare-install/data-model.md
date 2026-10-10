# Data model

No persistent schema changes. Existing migrations 0001–0004 remain the complete installation set.

- Website configuration: exact HTTPS origin, project ID, source ID, public source key, Worker origin. Source ID scopes tokens; public source key routes browser events.
- Token: HS256, audience vizoalica-ingest, scope events:write, fixed project_id/source_id/origin, iat/nbf, exp=iat+300, random jti, max_events=25. No visitor identity.
- Integration response: existing metadata plus complete escaped HTML from local API. Consent defaults to unknown.
- Verification: content and scope checks only; no token or credential written to output. Signature acceptance established by real ingestion separately.
