# Quickstart Validation: Event Collection Foundation

This guide defines validation scenarios for v0.1.0. It is not an implementation guide.

## Prerequisites

- A local self-hosted Vizoalica deployment is running.
- One project and one source are configured.
- The source has an allowed origin such as `http://localhost:8080`.
- A token issuer for the source can mint short-lived ingest tokens.
- The browser SDK is available to a test web page.

## Scenario 1: Signed page view is accepted

1. Start the local ingestion service.
2. Mint a short-lived token with `events:write`, matching project, source, and origin claims.
3. Open a test page that loads the browser SDK with the source identifier and token provider.
4. Trigger a page load.
5. Verify the ingestion response is accepted.
6. Verify exactly one `com.vizoalica.page_view.v1` event is recorded with signed trust level and redacted query values.

**Expected outcome**: Event is accepted, schema-valid, associated with the configured project/source, and contains no raw sensitive content.

## Scenario 2: Backend down does not break the website

1. Open the test page with the SDK installed.
2. Stop the ingestion service or block its endpoint.
3. Interact with the page.
4. Verify the page remains usable and no visitor-facing analytics error appears.

**Expected outcome**: Analytics delivery fails silently and does not block or break the host website.

## Scenario 3: Invalid or expired token is rejected

1. Send a valid-looking event batch with an expired token.
2. Send another batch with a token whose origin or source does not match the request.
3. Inspect ingestion decisions.

**Expected outcome**: Production ingestion rejects both batches before persistence with safe reason codes.

## Scenario 4: Oversized and malformed payloads are rejected early

1. Send a batch with more than the maximum allowed events.
2. Send a request larger than the configured maximum request size.
3. Send an event with unsupported type or extra fields.

**Expected outcome**: Requests are rejected before storage or downstream processing.

## Scenario 5: Privacy filters prevent sensitive data storage

1. Open a page whose URL includes secret-like query parameters.
2. Submit or edit forms on the page.
3. Trigger page view and custom event capture.
4. Inspect stored event data.

**Expected outcome**: Query values are redacted or omitted, and raw form contents are absent.

## Scenario 6: Quotas isolate abusive projects

1. Configure two projects with separate quota policies.
2. Send over-quota traffic for one project.
3. Continue sending valid in-quota traffic for the other project.

**Expected outcome**: The abusive project is throttled or dropped, while the unrelated project continues to accept valid events.

## Scenario 7: Demo mode is visibly lower trust

1. Enable demo mode for a project/source.
2. Send events without a signed token.
3. Inspect stored records.

**Expected outcome**: Events may be accepted only under demo policy and are marked as `unsigned-demo`, never `signed-session`.
