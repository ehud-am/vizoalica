# Research: Dashboard Visual Refresh

## Decision 1: Keep the existing deployment footprint

**Decision**: Extend the existing ingestion Worker, D1 database, R2 event store, loopback local API, and React console. Add one daily Cron Trigger to the same Worker for retention cleanup. Do not add an analytics service, queue, identity service, geolocation API, or managed chart service.

**Rationale**: D1 scales to zero and charges by rows read/written rather than provisioned compute. The current default quota is only 100 accepted events per source per day, so bounded aggregates fit the free-first deployment model. A scheduled handler is part of the existing Worker and requires no always-on process. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) document this operating model.

**Alternatives considered**:

- Query R2 event objects for each dashboard request: rejected because it is slower, costlier, and violates the constitution's bounded-aggregate rule.
- Add Cloudflare Analytics Engine or a third-party analytics service: rejected because it adds a service, migration surface, and possible recurring cost.
- Add a queue/consumer for rollups: rejected at current quotas because synchronous D1 batches are simpler and preserve immediate visibility.

## Decision 2: Use minute aggregates and complete-minute query boundaries

**Decision**: Store newly accepted page views in UTC minute buckets. Presets end at the latest complete minute. Custom controls accept minute-granular local values, convert them once to UTC, and require aligned `[start,end)` boundaries no more than 30 days apart. Return hourly trend points through 24 hours and daily points above 24 hours.

**Rationale**: The current hourly schema cannot accurately answer a rolling range whose start or end falls within an hour. Minute buckets are the smallest simple model that matches native `datetime-local` input precision without keeping second-level facts or scanning raw events. A 30-day result remains bounded to at most 43,200 source-minute buckets before server-side trend reduction and usually far fewer because empty minutes have no rows.

**Alternatives considered**:

- Hour buckets with silent rounding: rejected because the displayed range would not match the queried range.
- Per-second or per-event analytics facts: rejected because they behave like a raw-event query table and grow unnecessarily.
- Dual hourly/minute boundary tables: rejected because it adds synchronization and query complexity for little savings at the current quota.

## Decision 3: Store independent dimension counts

**Decision**: Use one generic `dashboard_minute_dimensions` table with one row per project, source, minute, dimension kind, and normalized value. Store page path, country, normalized user-agent family, browser, operating system, device, traffic classification, and referrer origin as independent counts.

**Rationale**: Independent rows answer every requested top-ten or distribution query without storing a wide tuple that can reconstruct a visitor-like profile. A generic table gives one tested ranking query and one retention policy. Path and referrer cardinality are bounded by the existing daily ingestion quota, input length limits, and 32-day retention; all classification dimensions have finite taxonomies.

**Alternatives considered**:

- One table per dimension: rejected because it duplicates migrations and repository logic.
- One multidimensional cube row per combination: rejected because combinations multiply cardinality and enable unnecessary correlations.
- JSON counters per minute: rejected because concurrent read-modify-write updates are harder to make correct and indexed top-value queries are poor.

## Decision 4: Normalize edge metadata immediately and own the classifier

**Decision**: Read country, optional Bot Management data, and at most 512 characters of User-Agent only in the Worker adapter. Convert them immediately to a versioned bounded taxonomy and pass only that normalized context to aggregation. Never add raw metadata to CloudEvents, R2, D1, logs, errors, or API responses.

**Rationale**: Cloudflare documents `request.cf.country` on all Workers plans and `request.cf.botManagement` as absent when Bot Management is unavailable. A small in-repository classifier keeps the default install portable and avoids a paid feature or external request. It also avoids `ua-parser-js` v2's licensing and dependency concerns. [Worker Request properties](https://developers.cloudflare.com/workers/runtime-apis/request/), [CF-IPCountry values](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-ipcountry), [Bot score semantics](https://developers.cloudflare.com/bots/concepts/bot-score/), and [Bot Management plans](https://developers.cloudflare.com/bots/plans/bm-subscription/) support these boundaries.

**Taxonomy v1**:

- Browser: Chrome, Edge, Firefox, Safari, Samsung Internet, Opera, Internet Explorer, Other, Unknown.
- Operating system: Windows, macOS, iOS, Android, Chrome OS, Linux, Other, Unknown.
- Device: Desktop, Mobile, Tablet, Other, Unknown.
- Traffic: Bot, Human, Unknown.
- User agent: browser families above plus Googlebot, Bingbot, Other bot, HTTP client, Other, Unknown; recognized browser major version is restricted to 0–999.
- Country: uppercase ISO alpha-2, Tor Network for `T1`, and Unknown for `XX`, missing, or invalid values.

Strong bot markers, verified bots, signed agents, or a valid low bot score produce Bot. A recognized ordinary browser with no conflicting automation evidence, or a valid human bot score, produces Human. Ambiguous, missing, malformed, or conflicting data produces Unknown. A bot marker wins over a human-looking browser signature. This classification describes traffic evidence; it is not an authentication or security decision.

**Alternatives considered**:

- Trust the `CF-IPCountry` header: rejected because direct requests can spoof a header; production uses the runtime's trusted `request.cf.country` only.
- Require Bot Management: rejected because it is a paid add-on and may be absent.
- Send raw UA to an external parser: rejected for privacy, latency, availability, and cost.
- Persist bot score, JA3/JA4, ASN, IP, device model, or detection IDs: rejected because the dashboard does not need them.

## Decision 5: Make aggregation idempotent with short-lived HMAC event digests

**Decision**: Add a 32-day event-digest ledger. Hash event IDs with a deployment-generated Worker-only `VIZOALICA_ANALYTICS_DIGEST_SECRET` and project ID. Within one D1 batch transaction, mark unseen digests with a transient request nonce, aggregate only rows carrying that nonce, then clear it before commit. Coalesce identical aggregate changes from the same request.

**Rationale**: The existing path writes R2 before D1 and can double-count when a client retries an accepted event or a response is lost. D1 documents `batch()` as sequential transactional execution that rolls back the sequence on failure. The nonce lets multiple aggregate statements distinguish newly inserted digests without keeping a raw event ID or durable batch correlation. A dedicated digest secret prevents ordinary JWT signing-key rotation from splitting unique counts and has no service cost; the deployment CLI can generate it automatically. [D1 batch API](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) documents the transaction behavior.

**Alternatives considered**:

- Accept duplicate counts: rejected because retry behavior would make totals unreliable.
- Store raw event IDs: rejected because an HMAC digest fulfills the idempotency purpose with less exposure.
- Check seen IDs before writing: rejected because a read-then-write race can double count.

## Decision 6: Define unique users without cross-site fingerprinting

**Decision**: Persist the SDK's default anonymous ID in consent-eligible first-party storage, namespaced by public source key. Use separate HMAC domains: project-supplied identities are scoped to project and source-local identities are scoped to project plus source. If a reviewed token issuer supplies a stable project-scoped `visitor_id`, matching values deduplicate across sources. Otherwise source-local anonymous values remain separate in the all-websites total.

**Rationale**: The current SDK creates a new random identifier on each initialization, so its unique-user value is closer to page loads. First-party persistence fixes repeat visits on one site. Separate origins cannot share browser storage, and forcing a common identifier through third-party storage or fingerprinting would undermine the privacy model. The contract therefore states what can and cannot be deduplicated instead of making an impossible default claim.

**Alternatives considered**:

- Sum per-source unique counts: rejected because it cannot deduplicate an owner-provided shared project identity.
- Third-party cookies or browser fingerprinting: rejected for privacy and reliability.
- Probabilistic cross-site matching: rejected because it creates hidden identity inference.
- HyperLogLog sketches: deferred because current quotas support exact distinct counts and sketches add approximation/version complexity.

## Decision 7: Use indexed project-wide and source-specific query paths

**Decision**: Create composite indexes for `(project_id, minute_utc, source_id)` and `(project_id, source_id, minute_utc)` on totals and visitors, plus project-wide and source-specific variants that include `dimension_kind` before time on dimension counts. Verify both query shapes with `EXPLAIN QUERY PLAN`.

**Rationale**: D1 bills rows scanned, not just rows returned. Its official guidance recommends indexes whose leftmost columns match common predicates and `EXPLAIN QUERY PLAN` to confirm indexed searches. Separate all-sites and one-site index orders avoid scanning unrelated projects or sources. [D1 index guidance](https://developers.cloudflare.com/d1/best-practices/use-indexes/) explains the performance and billing effect.

**Alternatives considered**:

- One source-first index only: rejected because all-sites queries cannot efficiently skip the source column.
- Add indexes for every output sort: rejected because extra indexes increase write and storage cost; aggregation sorting occurs over already bounded result sets.

## Decision 8: Return one coherent analytics document

**Decision**: Add a project-level analytics endpoint with optional `source_id` and explicit `start`/`end`. It returns scope, range, totals, trend, rankings, distributions, and completeness in one JSON document. The local API proxies the document unchanged after validation. Keep the old website-summary route as a one-release compatibility adapter.

**Rationale**: A single request prevents widgets from showing mixed scopes or ranges and minimizes Worker/API round trips. Explicit boundaries make presets and custom ranges identical at the storage layer. Absence of `source_id` is a natural all-websites scope, while ownership validation closes cross-project access.

**Alternatives considered**:

- One endpoint per widget: rejected because it increases latency, consistency state, and authorization surface.
- Keep only `window=24h|7d|30d`: rejected because it cannot represent 6h, 12h, or custom ranges.
- Encode all websites as a magic source ID: rejected because omission is clearer and avoids an identifier collision.

## Decision 9: Use Tailwind CSS 4, small owned primitives, and Recharts

**Decision**: Add Tailwind CSS 4 and its Vite plugin for a CSS-first semantic token system. Build the shell, controls, cards, tables, badges, and notices in the repository. Add Recharts 3 for responsive SVG line and pie/donut charts, always paired with semantic text/table equivalents.

**Rationale**: Tailwind's official Vite integration requires little configuration and has zero browser runtime. Recharts supports responsive React SVG charts and an accessibility layer; companion text remains necessary because SVG tooltips alone do not expose every value. [Tailwind v4](https://tailwindcss.com/blog/tailwindcss-v4), [Tailwind compatibility](https://tailwindcss.com/docs/compatibility), and the [Recharts API](https://recharts.github.io/en-US/api/) document the selected capabilities.

**Alternatives considered**:

- shadcn/Radix or a full component suite: rejected because this console needs only a small set of standard controls and would gain several dependencies.
- Chart.js canvas charts: rejected because React integration and accessible equivalents require more imperative work.
- Handwritten chart geometry: rejected because responsive axes, resizing, focus, and pointer behavior would create more custom code than the dependency saves.
- A date library: rejected because `Date`, `Intl.DateTimeFormat`, and native minute inputs cover this bounded selector.

## Decision 10: Use a native, draft-then-apply range selector

**Decision**: Use a compact trigger and native `popover="auto"`. Inside, render a preset radio group and labeled `datetime-local` start/end inputs with one Apply action. Maintain draft and applied state separately; dismissing the popover does not query or alter the applied range.

**Rationale**: Native form semantics provide keyboard and assistive-technology behavior with less code. The supplied screenshot establishes a useful wide-screen structure, while a single-column narrow layout meets reflow requirements. Server validation remains authoritative. [Native popover](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/popover) and [`datetime-local`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/datetime-local) describe the platform behavior.

**Alternatives considered**:

- A calendar library: rejected because the required controls are two minute values and five presets, not date arithmetic or recurring schedules.
- Apply every field change immediately: rejected because it creates partial queries and contradicts the requested Apply interaction.

## Decision 11: Persist theme in a separate protected local file

**Decision**: Add authenticated loopback `GET`/`PUT /api/preferences/theme`. Store `{schemaVersion, theme, updatedAt}` in `preferences.json` beside the existing configured local-operations file with atomic replacement and mode `0600`. If no explicit value exists, follow `prefers-color-scheme` without writing a file.

**Rationale**: Browser code cannot directly write the operator's home directory. The local API already enforces loopback host, exact origin/referrer, and an HttpOnly session. Separating preference data from `local-operations.json` prevents a preference write from exposing or overwriting the administrator credential. Tailwind documents data-attribute dark variants and system-theme detection through `matchMedia`. [Tailwind dark mode](https://tailwindcss.com/docs/dark-mode) provides the implementation pattern.

**Alternatives considered**:

- `localStorage` only: rejected because it does not meet the requested operator-owned filesystem persistence.
- Put theme in the credential file: rejected because presentation code must not rewrite secrets.
- Sync theme to Cloudflare: rejected because the preference is local and does not belong in analytics data.

## Decision 12: Use vector-first original branding and the root version

**Decision**: Create an original magnifying-glass SVG system with dark-background primary lockup, light-background variant, monochrome mark, square mark, and favicon. Keep the SVG master in the repository and document minimum size, clear space, colors, and accessible use. Inject the root `package.json` version at build time through Vite `define` and render `vunknown` only if unavailable.

**Rationale**: SVG remains sharp at header, documentation, favicon, and repository sizes without paid tooling. The root package already owns the release version (`0.3.1`), while child packages have unrelated private versions. Vite officially supports compile-time app constants and stable public assets. [Vite shared options](https://vite.dev/config/shared-options.html) and [public assets](https://vite.dev/guide/assets.html) cover both mechanisms.

**Alternatives considered**:

- Hard-code a footer version: rejected because it becomes stale.
- Use a generated bitmap as the sole master: rejected because small and large placements need a scalable source.
- Use a stock icon as the logo: rejected because it is not distinctive and may introduce licensing/trademark ambiguity.
