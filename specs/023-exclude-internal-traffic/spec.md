# Feature Specification: Exclude Internal Traffic

**Feature Branch**: `023-exclude-internal-traffic`

**Created**: 2026-10-17

**Status**: Implemented for v0.11.0 (GitHub issue #61); awaiting the release owner's go/no-go. QA report: [qa-report.md](qa-report.md)

**Input**: "Keep the site owner's and team's own visits out of the numbers. Per-website exclusion by IP address or
range, set in the console and CLI. Alternative: a browser opt-out switch (`localStorage` flag set by visiting a
URL) so no IP list is needed. Excluded hits are dropped at ingestion and never stored; show a count of excluded
hits for transparency."

## Decisions (2026-10-17)

| #   | Question                                  | Decision                                                                                                                                                                                                  |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Address list, browser opt-out, or both    | Both. They cover different people: a fixed office address vs. a person on a changing connection.                                                                                                          |
| Q2  | Address syntax                            | Single IPv4 or IPv6 address, or a CIDR range (`203.0.113.0/24`, `2001:db8::/48`). At most 25 entries per website. IPv4-mapped IPv6 (`::ffff:1.2.3.4`) is treated as the IPv4 address.                   |
| Q3  | "CLI" in the issue                        | There is no command that manages website settings today (websites are managed in the console and the admin API), so this feature adds none. The MCP `website_status` tool reports the setting read-only.   |
| Q4  | Where a hit is dropped                    | In the Worker pipeline after the website and token or origin are verified, before quota, raw-event storage and rollups. Unauthenticated traffic never reaches the counter.                                  |
| Q5  | What the sender sees                      | `202` with decision `excluded` and `accepted_count` 0. Only the excluded address's own requests see it; it is not an error, so the SDK does not retry.                                                     |
| Q6  | Transparency count                        | A per-website, per-day counter of dropped events, no address stored. Shown on the website page (last 30 days) and in the MCP `website_status` tool. Kept 32 days.                                            |
| Q7  | Browser opt-out mechanism                 | Visiting any page of the website with `?vizoalica_ignore=1` sets `localStorage["vizoalica.ignore"]="1"` on that browser and origin; `?vizoalica_ignore=0` removes it. While set, the SDK sends nothing.   |
| Q8  | Counting browser opt-outs                 | Not possible by design (nothing is sent), so the counter covers address exclusions only. The docs and the website page say so.                                                                              |
| Q9  | Retroactive?                              | No. Events already stored stay. The page says so.                                                                                                                                                          |
| Q10 | Who can see and change the list           | Admin and website-owner access keys can read and change it. Analysts see only how many entries there are. Changes are audited (the existing `update_source` entry; addresses are not written to the audit). |
| Q11 | Update order                              | The setting needs migration `0006`. A Worker older than 0.11.0 ignores it. The SDK opt-out works with any backend.                                                                                         |

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Keep my office out of the numbers (Priority: P1)

As a website owner, I enter my office's address (or range) on the website page, save, and from then on visits
from it no longer appear in any report.

**Independent Test**: Create a website, add `203.0.113.7`, send a page view from that address and one from
`203.0.113.8`. Only the second appears in Overview, Pages and Real-time numbers; the website page shows 1
excluded hit.

**Acceptance Scenarios**:

1. **Given** an excluded address, **When** a batch arrives from it with a valid token or allowed origin,
   **Then** no raw event, rollup, quota use or visitor digest is recorded, the response is `202 excluded`, and
   the daily excluded counter increases by the number of events in the batch.
2. **Given** a CIDR range, **When** a batch arrives from any address inside it, **Then** it is excluded; from an
   address outside it, **Then** it is counted normally.
3. **Given** an IPv6 address or range, **Then** the same rules apply, comparing the full 128-bit values.
4. **Given** a batch with a bad token or an origin that is not allowed, **When** it arrives from an excluded
   address, **Then** it is refused exactly as it would be from any address (401 or 403) and nothing is counted.
5. **Given** no `cf-connecting-ip` header (local or test calls), **Then** nothing is excluded.
6. **Given** the list is edited, **When** the next batch arrives, **Then** the new list applies (no delay, no
   cache to expire).
7. **Given** the list is empty, **Then** ingestion does the same work as before this feature (no extra
   statements).
8. **Given** an excluded address sends custom events and actions, **Then** those are excluded as well; the whole
   batch is dropped.

---

### User Story 2 - Exclude myself with no address list (Priority: P1)

As a team member on a changing connection, I visit `https://example.com/?vizoalica_ignore=1` once; from then on
my browser sends nothing for that website. Visiting `?vizoalica_ignore=0` turns it off.

**Acceptance Scenarios**:

1. **Given** the URL parameter `vizoalica_ignore=1`, **When** the SDK starts, **Then** it sets the flag, sends no
   events (including the page view of that very load), observes no navigation or clicks, and `track()`/`page()`
   are no-ops.
2. **Given** the flag is set, **When** a later page loads without the parameter, **Then** the SDK still sends
   nothing.
3. **Given** `vizoalica_ignore=0` (or `false`), **Then** the flag is removed and the SDK works as usual on that
   load.
4. **Given** storage is blocked or throws, **Then** the SDK behaves as if the flag were unset, except that a
   page loaded with `vizoalica_ignore=1` is itself silent for that load. The host page never sees an error.
5. **Given** any other value of the parameter, **Then** it is ignored.
6. The flag stores the constant `1` only. It is per browser and per website origin, so it must be set on each
   website (and each of its origins) separately; the documentation says this and says to clear it in the
   browser's site data.

---

### User Story 3 - Know how much is being dropped (Priority: P2)

As an owner, I want to see that exclusion works and is not hiding real visitors.

**Acceptance Scenarios**:

1. **Given** excluded hits in the last 30 days, **Then** the website page shows the total and the per-day trend
   as a number and a short list, with the explanation that browser opt-outs are not counted.
2. **Given** no list is set, **Then** the card shows how to set one and links the documentation.
3. **Given** the MCP `website_status` tool, **Then** it reports the number of entries and the excluded hits in
   the last 30 days, never the addresses.
4. **Given** an analyst key, **Then** the addresses are not returned by any endpoint; the count of entries is.

---

### Edge Cases

- An address the owner enters wrongly (`203.0.113.7/33`, `abc`, a hostname): refused with a message naming the
  entry and the accepted forms. The whole save is refused; nothing is partially saved.
- Duplicate or overlapping entries: allowed; duplicates are removed on save.
- The owner excludes their own visit and then sees no data from their test: the website page shows the counter,
  and the docs say to test from an address that is not on the list.
- A shared address (a university, a carrier-grade NAT): the docs warn that everyone behind it is excluded.
- Behind a proxy, `cf-connecting-ip` is the address Cloudflare saw; the docs say so.
- Cron/other callers: only the events endpoint applies exclusion; reports are unaffected.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: A website MUST have an optional list of excluded addresses (IPv4/IPv6 address or CIDR), at most 25,
  stored in its configuration row (`sources.excluded_addresses_json`, migration `0006`).
- **FR-002**: The admin API MUST accept `excludedAddresses` on website create and update, validate every entry
  strictly, store the canonical form, and refuse the whole request on any invalid entry.
- **FR-003**: Admin and owner principals MUST receive the list; analysts MUST receive only
  `excludedAddressCount`. The list MUST NOT be written to logs, the audit table or error messages.
- **FR-004**: The pipeline MUST drop a batch from an excluded address after source authorization and token or
  origin verification and before quota, storage and rollups, count it in `dashboard_excluded_hits`, and respond
  `202` with decision `excluded`.
- **FR-005**: The client address MUST be used only for the match, in memory, and MUST NOT be stored, logged or
  returned.
- **FR-006**: The admin API MUST report excluded hits per day for a website (last 30 days at most) and the
  website status MUST include the 30-day total.
- **FR-007**: The SDK MUST implement the opt-out in Q7, without throwing, without reading anything else from the
  URL, and with the flag value fixed to `1`.
- **FR-008**: The console MUST let admin and owner roles edit the list on the website's Edit page (not on the Add
  page: a new website starts counting everything, and the list is a setting to add once there is traffic to
  compare) and show the excluded-hits card on the website page, accessible and keyboard-operable. When the
  backend is older than 0.11 and does not apply the list, the console MUST say so after saving.
- **FR-009**: The install check sends no events (it probes the token endpoint and configuration), so it is
  unaffected; the website page's excluded-hits card is how an owner sees that their own visits are being
  dropped.
- **FR-010**: Retention and purge MUST include the counter table (32 days; with a deleted website).
- **FR-011**: Documentation MUST include an "Exclude your own visits" page (both methods, finding your address,
  shared-address warning, the update order, not retroactive, browser opt-out limits) and updates to privacy,
  browser SDK, AI pages and the skill.

### Key Entities

- **Excluded address list**: up to 25 canonical strings on a website.
- **Excluded hits counter**: website, UTC day, count. No address.
- **Browser opt-out flag**: `localStorage["vizoalica.ignore"] = "1"` on the owner's own device.

## Privacy and Cost Review

| Data                     | Purpose                              | Retention                               | Access boundary                          | Review                                                                                      |
| ------------------------ | ------------------------------------ | --------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| Excluded address list    | Recognise the owner's own traffic    | Until the owner removes it or the site is deleted | Admin and owner keys only                | Operator-entered configuration, not visitor data; never in logs or audit; 25 entry cap.     |
| Excluded hits counter    | Transparency about dropped events    | 32 days                                 | Roles and scopes as other reports        | A count per day; no address, no identifier.                                                 |
| Client address (in flight) | Match against the list             | Not retained                            | Worker memory only                       | Same header the daily visitor id already uses; never persisted.                              |
| Browser flag             | Opt a browser out                    | Until the owner clears it               | The owner's browser                      | One constant on the owner's own device; documented. Does not identify anyone.                |

Abuse: only authenticated batches can increment the counter, so unauthenticated traffic costs nothing extra;
excluded traffic skips quota, so the existing per-address rate limiter remains the cap. Cost: one D1 read of the
website already happens; the list is parsed from that row. One counter upsert per excluded batch. No extra
statements when the list is empty.

## Success Criteria

- **SC-001**: In an end-to-end test through `worker.fetch` on the real schema, a batch from an excluded address
  leaves every dashboard table and R2 untouched except the counter, and a batch from another address is counted.
- **SC-002**: A validation table of at least 30 good and bad address forms (v4, v6, mapped, CIDR edges, hostnames,
  ranges out of bounds, 26 entries) behaves as specified.
- **SC-003**: CIDR matching is exact at range boundaries for /0, /8, /24, /32, /48, /64, /128.
- **SC-004**: An invalid token from an excluded address is refused 401, not 202 (no oracle for exclusion).
- **SC-005**: SDK opt-out tests cover set, unset, persisted, storage-throws, other values, and no network on any
  excluded path.
- **SC-006**: An analyst never receives addresses (contract test on every endpoint that returns a website).
- **SC-007**: The console passes axe in light and dark at 320 px and 200% zoom; keyboard test for edit and save.
- **SC-008**: Repository coverage stays above 90% lines and branches.

## Out of Scope

- Excluding by user agent, country, path or cookie.
- Removing already stored events.
- Counting browser opt-outs.
- A website-settings CLI.
- Automatic detection of "my current address" (the Worker does not know the console's public address).
