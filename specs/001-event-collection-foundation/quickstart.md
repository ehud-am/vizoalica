# Quickstart Validation: Event Collection Foundation

This guide defines validation scenarios for v0.1.0. It is not an implementation guide.

## Prerequisites

- A Cloudflare deployment of the Vizoalica ingestion Worker is running.
- The deployment has a D1 database binding for configuration and quota state, an R2 bucket binding for accepted event batches, and a retention lifecycle rule.
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

## Scenario 8: Accepted batches are durably retained without sensitive object metadata

1. Send one valid signed event batch to the deployed Worker.
2. Verify the response reports an accepted decision only after the batch is available in the configured R2 bucket.
3. Inspect the object key and metadata without reading the payload.
4. Verify the key is partitioned only by server-approved project/source/time context and an opaque identifier.
5. Verify no visitor, session, token, or raw URL value appears in the object key or metadata.

**Expected outcome**: The raw batch is durably retained in R2 with privacy-safe metadata and can be expired by lifecycle policy.
