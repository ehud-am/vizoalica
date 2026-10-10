# Feature Specification: Dashboard Visual Refresh

**Feature Branch**: `[007-dashboard-visual-refresh]`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "Create a professional magnifying-glass logo on a dark background; expand the analytics landing page with classic aggregate widgets for all websites or a selected website; add preset and custom time ranges using the attached selector as an interaction reference; establish a polished utility-style visual system; support persisted light and dark themes; and add a versioned footer."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Understand Traffic at a Glance (Priority: P1)

As an authorized operator, I can open the analytics landing page and immediately understand traffic across every website in the selected project, or narrow the results to one website, without inspecting raw events.

**Why this priority**: The dashboard's primary purpose is to turn collected events into a useful, privacy-safe overview. The current two-number summary does not provide enough context to diagnose traffic patterns.

**Independent Test**: Load a project containing multiple websites and known aggregate data, select "All websites," then select one website. Verify that every widget updates to the same scope, shared owner-supplied project identifiers are deduplicated, and ordinary first-party anonymous identifiers are not linked across unrelated website origins.

**Acceptance Scenarios**:

1. **Given** a project with two or more active websites, **When** the operator opens the overview, **Then** the page defaults to "All websites" and all visible totals, rankings, charts, range labels, and completeness states describe that project-wide scope.
2. **Given** project-wide results, **When** the operator selects one website, **Then** every widget updates together and clearly identifies the selected website.
3. **Given** two websites submit the same reviewed, owner-supplied project-scoped pseudonymous identifier, **When** project-wide unique users are shown, **Then** that identifier contributes once; first-party anonymous identifiers from separate origins remain separate and are never joined through fingerprinting.
4. **Given** complete aggregate data, **When** the overview loads, **Then** it shows total unique users, total page views, a traffic-over-time trend, top ten page paths, top ten countries, top ten normalized user-agent families, operating-system share, browser share, device-category share, referrer-origin ranking, and human-versus-bot share.
5. **Given** fewer than ten ranked values or no traffic, **When** the page renders, **Then** it shows only available values or a clear zero-data state without filler rows or misleading percentages.

---

### User Story 2 - Choose a Useful Time Range (Priority: P1)

As an operator, I can apply a common recent time range or a precise custom range and see all dashboard results use that exact period.

**Why this priority**: Analytics widgets are meaningful only when their reporting period is obvious and consistent. Short ranges support live troubleshooting, while longer ranges reveal trends.

**Independent Test**: Select each preset, then apply valid and invalid custom ranges. Verify the displayed period, timezone, results, keyboard behavior, validation, and consistency across all widgets.

**Acceptance Scenarios**:

1. **Given** the range selector is closed, **When** the operator opens it, **Then** a clear selector offers Last 6 hours, Last 12 hours, Last 24 hours, Last 7 days, Last 30 days, and Custom range.
2. **Given** a preset is chosen, **When** the selection is applied, **Then** all widgets refresh to one shared half-open time range and the control announces the active range.
3. **Given** Custom range is selected, **When** the operator enters a valid start and end no more than 30 days apart, **Then** the selector shows both values, the active local timezone, and applies the range only after the operator chooses Apply.
4. **Given** an end before or equal to the start, a future end, or a range longer than 30 days, **When** the operator tries to apply it, **Then** no query runs and the exact validation problem is announced beside the controls.
5. **Given** a narrow viewport or keyboard-only use, **When** the selector is operated, **Then** it reflows without horizontal scrolling, maintains a logical focus order, traps no focus, closes predictably, and returns focus to its trigger.

---

### User Story 3 - Use a Professional, Accessible Interface (Priority: P2)

As an operator, I can use a coherent, responsive analytics interface in light or dark mode, with a recognizable Vizoalica identity and consistent navigation, cards, tables, and charts.

**Why this priority**: A clear visual hierarchy makes a data-dense dashboard faster to scan and builds confidence in the project, while accessible themes and responsive behavior make it usable in ordinary working conditions.

**Independent Test**: Review the dashboard at desktop and narrow widths in both themes, using keyboard navigation and representative assistive technology. Verify visual hierarchy, chart alternatives, contrast, zoom, focus, empty/error states, and persisted theme behavior.

**Acceptance Scenarios**:

1. **Given** any project page, **When** it loads, **Then** it uses the same professional Vizoalica brand, navigation, spacing, typography, controls, data cards, status treatments, and responsive layout.
2. **Given** the operator changes between light and dark mode, **When** the page refreshes or the local console restarts, **Then** the explicit preference remains selected for that operator.
3. **Given** no saved preference, **When** the console first loads, **Then** it follows the operating-system color preference and lets the operator choose an explicit light or dark preference.
4. **Given** local preference storage is unavailable or invalid, **When** the operator changes the theme, **Then** the theme works for the current session, the problem is reported without blocking analytics, and no analytics credential is exposed.
5. **Given** a chart communicates categories or a trend, **When** it is viewed with color-vision deficiency, high zoom, keyboard navigation, or a screen reader, **Then** the same values and labels are available without relying on color or pointer hover alone.

---

### User Story 4 - Recognize and Identify the Product (Priority: P3)

As a project visitor or console operator, I see an original, professional Vizoalica logo and an accurate product footer.

**Why this priority**: A stable identity and version label make the open-source project easier to recognize and make support reports easier to interpret.

**Independent Test**: Inspect the repository-facing and console-facing brand placements at common sizes and in both themes, then compare the displayed footer version with the running release.

**Acceptance Scenarios**:

1. **Given** the logo is displayed on a dark surface, **When** it is viewed at header, documentation, and repository-preview sizes, **Then** the magnifying-glass concept remains legible, distinctive, and free of unlicensed third-party marks.
2. **Given** the logo cannot be seen, **When** assistive technology encounters it, **Then** meaningful instances have an accessible Vizoalica name and decorative repetitions are ignored.
3. **Given** any main console page, **When** the operator reaches the footer, **Then** it reads `2026 | Vizoalica | v0.x.y`, where the version reflects the running release rather than a separately maintained placeholder.

### Edge Cases

- A project has no websites, only disabled or deleted websites, or a selected website becomes unavailable while the dashboard is open.
- One widget is processing or unavailable while other aggregate widgets are complete.
- A category is missing, unknown, uncommon, or tied at the tenth-ranked position.
- Bot classification is unknown or confidence is insufficient; unknown traffic must not be silently labeled human.
- Country information is unavailable, including privacy relays and traffic without a usable edge country code.
- A page path contains unusual Unicode or a very long safe path; query values and fragments remain excluded.
- A browser or operating-system family cannot be normalized without preserving a raw user-agent string.
- The selected custom range crosses daylight-saving or calendar-day boundaries in the operator's timezone.
- The browser window is resized while the time selector is open, or the selector is dismissed without applying edits.
- The theme preference file is absent, unreadable, invalid, or not writable.
- The displayed application version is unavailable at startup.
- Rankings contain more than ten values; remaining values are grouped or omitted consistently and totals remain understandable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST make the analytics overview the primary landing page after an authorized local console session begins.
- **FR-002**: The overview MUST provide an "All websites" scope for the selected project and a dropdown containing every individually reportable website in that project.
- **FR-003**: Changing the project, website scope, or time range MUST update every dashboard widget as one coherent result and MUST prevent results from a prior scope from being presented as current.
- **FR-004**: Project-wide page views MUST include page views from all reportable websites in the project. Project-wide unique users MUST deduplicate matching reviewed, owner-supplied project-scoped pseudonymous identifiers, MUST otherwise treat source-local anonymous identifiers as separate, and MUST NOT create a cross-site identity through third-party cookies or fingerprinting.
- **FR-005**: The overview MUST show total page views and total unique users as prominent summary values, including explicit zero, processing, incomplete, unavailable, and current-data states.
- **FR-006**: The overview MUST show a page-view and unique-user trend over time using a consistent interval appropriate to the selected range.
- **FR-007**: The overview MUST show ranked lists, limited to ten displayed values each, for safe page paths, countries, normalized user-agent families, and referrer origins.
- **FR-008**: The overview MUST show categorical distributions for operating-system family, browser family, device category, and human, bot, or unknown classification.
- **FR-009**: Rankings and distributions MUST identify unknown values explicitly and MUST represent values outside the displayed leaders consistently as "Other" when needed to make percentages or totals complete.
- **FR-010**: Page reporting MUST exclude URL query values and fragments. Referrer reporting MUST remain limited to a normalized origin. The interface MUST never expose raw events, visitor identifiers, session identifiers, IP addresses, full user-agent strings, or raw headers.
- **FR-011**: Country aggregation MUST use a coarse country code available at the trusted ingestion boundary and MUST NOT require storing an IP address or deriving more precise location.
- **FR-012**: Browser, operating-system, device, normalized user-agent, and bot classifications MUST be derived into a bounded documented taxonomy before analytics storage; the raw user-agent value MUST NOT be retained for dashboard analytics.
- **FR-013**: Bot classification MUST include an explicit Unknown category and MUST NOT use fingerprinting or silently treat uncertain traffic as human.
- **FR-014**: Normal dashboard queries MUST use bounded aggregate data and MUST NOT scan raw-event storage.
- **FR-015**: Every analytics request MUST remain project-authorized, and a website-specific request MUST verify that the website belongs to the selected project before returning any result.
- **FR-016**: The time-range selector MUST offer exactly these presets: Last 6 hours, Last 12 hours, Last 24 hours, Last 7 days, and Last 30 days, plus Custom range.
- **FR-017**: Custom ranges MUST require a start before the end, end no later than the current time, and duration no greater than 30 days. The applied range MUST be represented as `[start, end)` to avoid double counting adjacent ranges.
- **FR-018**: The range selector MUST display the operator's active timezone, preserve unapplied custom edits while open, and update analytics only when a valid selection is applied.
- **FR-019**: The range-selector interaction MUST follow the attached reference's simple model: presets separated from absolute start/end controls on wide screens, a single Apply action, visible selected state, and a compact summary trigger; it MUST reflow into one readable column on narrow screens.
- **FR-020**: All displayed aggregate values MUST use one documented timezone and interval definition, with UTC used as the canonical query boundary and the operator's local timezone used for labels.
- **FR-021**: The console MUST adopt a consistent utility-style visual system for layout, spacing, typography, color, elevation, forms, tables, charts, feedback, focus, and responsive behavior across existing and new pages.
- **FR-022**: The interface MUST support explicit Light and Dark choices. Before a choice exists, it MUST follow the operating-system preference without writing a preference on the operator's behalf.
- **FR-023**: An explicit theme choice MUST persist in the same operator-owned local configuration area as the console's other preferences, survive browser and console restarts, and remain outside website code and remote analytics data.
- **FR-024**: Theme preference access MUST preserve the local console's credential and file-permission boundaries; preference failures MUST NOT reveal or overwrite administrative credentials.
- **FR-025**: The visual experience, including charts and the range selector, MUST conform to WCAG 2.2 Level AA, support keyboard operation and 200% zoom, expose visible focus, meet contrast requirements in both themes, and provide text alternatives for graphical results.
- **FR-026**: The project MUST have an original professional logo centered on a magnifying-glass concept with a dark-background primary treatment, plus variants required for small-size, light-theme, monochrome, and accessible use.
- **FR-027**: Logo deliverables MUST include a scalable master, web-ready assets, a square mark, a horizontal lockup, and documented clear-space, minimum-size, color, and accessible-name guidance.
- **FR-028**: Main console pages MUST display the footer `2026 | Vizoalica | v0.x.y`; its version MUST come from the running product's authoritative release version and fail to a clearly unknown version rather than a stale hard-coded value.
- **FR-029**: Dashboard loading, empty, processing, partial, unavailable, validation, and authorization states MUST be explicit, accessible, and visually consistent without displaying stale data as current.
- **FR-030**: The expanded analytics collection and aggregation MUST preserve the existing low-cost operating model through bounded category cardinality, indexed aggregate queries, retention controls, and no new always-on service.
- **FR-031**: The data added for each dimension MUST have a documented purpose, retention rule, access boundary, normalization taxonomy, and privacy review before acceptance.
- **FR-032**: Existing website instrumentation MUST continue to fail safely when analytics is unavailable and MUST remain compatible for page-view collection after this dashboard expansion.

### Key Entities

- **Analytics Scope**: The selected project and either all reportable websites or one website that belongs to the project.
- **Time Range**: A preset or custom half-open interval, its canonical UTC boundaries, local display timezone, and suitable chart interval.
- **Analytics Overview**: The coherent response for one scope and time range, including totals, trend series, rankings, distributions, completeness, and last-completed time.
- **Ranked Dimension**: Up to ten normalized labels and counts for page path, country, user-agent family, or referrer origin, with Unknown or Other where applicable.
- **Categorical Distribution**: Bounded labeled counts and percentages for operating system, browser, device, and traffic classification.
- **Classification Taxonomy**: The versioned, bounded mapping that converts trusted request metadata into safe country, browser, operating-system, device, user-agent-family, and bot-status categories without retaining raw identifiers.
- **Theme Preference**: The operator's explicit light or dark choice, update time, and preference-schema version; it contains no analytics or credential data.
- **Brand Asset Set**: The canonical logo, its approved variants, display rules, and accessible naming.
- **Product Version**: The authoritative running release identifier shown in the footer and support context.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An authorized operator can open the landing page, select any website or all websites, choose a preset range, and identify total views, unique users, leading page, leading country, leading browser, and bot share in under 45 seconds.
- **SC-002**: In acceptance fixtures with reviewed project-scoped pseudonyms crossing websites, project-wide unique-user results match the deduplicated expected value in 100% of tested ranges; source-local fixture identities remain separate and project-wide results are never produced by summing precomputed website totals.
- **SC-003**: All five presets and valid custom ranges produce one consistent scope and period across 100% of dashboard widgets; every invalid custom range is rejected before a query is made.
- **SC-004**: Every ranking displays at most ten primary values, every distribution totals 100% after documented rounding, and Unknown or Other values account for unclassified or remaining traffic.
- **SC-005**: No dashboard response or persisted preference contains an IP address, raw user-agent string, visitor identifier, session identifier, raw event, URL query value, URL fragment, credential, or secret in automated privacy tests.
- **SC-006**: Representative dashboard queries for the maximum 30-day range complete in under 2 seconds with 95th-percentile sample data volume, without scanning raw-event storage.
- **SC-007**: All primary dashboard, selector, theme, navigation, and footer workflows pass automated accessibility checks and representative manual keyboard, 200% zoom, narrow-viewport, light-theme, and dark-theme reviews with no critical or serious accessibility findings.
- **SC-008**: An explicit theme choice survives browser refresh and local console restart in 100% of persistence tests; a missing or invalid preference falls back safely without blocking analytics.
- **SC-009**: The logo remains recognizable and legible at the documented minimum sizes, passes contrast requirements in each approved placement, and has no third-party trademark or licensing dependency.
- **SC-010**: The footer version matches the running release in 100% of release validation checks, and all main console pages render the same year, product name, and version format.
- **SC-011**: Existing page-view ingestion compatibility and host-page failure isolation pass without regression, while the expanded dashboard remains within the existing deployment's services and documented cost controls.

## Assumptions

- "Classic widgets" is bounded in this feature to the named metrics plus a traffic trend, device-category share, and top referrer origins. Funnels, cohorts, retention curves, session replay, heatmaps, revenue analytics, and arbitrary event-property exploration are outside this feature.
- "User agents" means normalized, bounded browser-family-and-major-version labels suitable for aggregate analytics. Full raw user-agent strings are outside this feature.
- The selected project remains the top-level authorization boundary. "All websites" means all reportable, non-deleted websites in that project; disabled websites retain historical analytics for periods in which they collected data.
- Browsers cannot share first-party anonymous storage across unrelated origins. The default SDK therefore reports source-local unique users in the all-websites view; exact cross-website deduplication is available only when the site owner supplies the same reviewed project-scoped pseudonymous identifier, such as from a shared authenticated account system.
- Custom ranges are limited to the same maximum 30-day horizon as the longest preset to preserve predictable privacy, cost, and query behavior.
- The screenshot is an interaction reference only. The product will use Vizoalica branding, accessible responsive behavior, the requested preset list, and the operator's local timezone rather than copying unrelated labels or styling.
- The request for `~/.visualica/` is understood to mean Vizoalica's existing operator-owned configuration home, currently documented as `~/.config/vizoalica/`. Theme preference will be stored separately from credentials within that boundary rather than creating a second misspelled directory.
- The project owner selected a utility-first styling approach for implementation. Detailed framework integration and component choices belong in the planning phase and must preserve the existing accessible behavior.
- The primary logo uses a dark background, while its asset set includes the variants needed to work in both application themes and common repository/documentation placements.
- Theme settings are local operator preferences. They are not synchronized to Cloudflare or shared between machines.
- The footer year is fixed to 2026 for this requested release; the version is dynamic and authoritative.
- Country data availability depends on trusted edge metadata. Missing country information is shown as Unknown and never reconstructed from stored network identifiers.
