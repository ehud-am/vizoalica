# Vizoalica data model

## Structure

- **Environment**: one backend (Worker, D1 database, R2 bucket) plus the role and credential this computer
  uses for it. Defined in `~/.config/vizoalica/environments.json`, managed with `vizoalica env`.
  Environments never share data.
- **Project**: a group of websites in one environment.
- **Website** (called a _source_ in the API): one site, with its allowed origins (exact addresses such as
  `https://example.com`) and a status (`active` or `disabled`).
- **Roles**: `admin` sees everything. An `owner` or `analyst` access key may be limited to one project or
  one website; anything outside that scope answers "not found".

## What is collected

- **Page views**: each page, and each screen of a single-page app. The page key is the path with
  identifiers grouped: `/orders/8841` becomes `/orders/:id`. No query strings or fragments.
- **Actions**: clicks (or Enter/Space) on buttons and links: page, name, kind (`button`, `link`,
  `other`), and for links the destination's origin and path. Names are cleaned: emails become `[email]`,
  long digit runs `[number]`, tokens `[token]`, at most 80 characters. Controls can be named with
  `data-vizoalica-action` and excluded with `data-vizoalica-ignore`.
- **Custom events**: sent by the site's code, with filtered properties.
- **Context per event**: country and continent, browser, operating system, device type (desktop, mobile,
  tablet), bot vs human, referrer (minimised), consent state.
- **Unique visitors**: counted from a privacy-preserving digest; there are no visitor identifiers to list.

## What is never collected

Form values, typed text, passwords, payment data, page text, DOM snapshots, click positions, heatmaps,
session replay, cookies, auth headers, raw URL query values, per-visitor histories.

## Reading results

- `totals.pageViews`, `totals.uniqueUsers` (unique visitors).
- `trend`: hourly for ranges of 24 hours or less, else daily. All times UTC.
- `rankings.pagePaths | referrers | countries | userAgents`: top items with `count`; `otherCount` is the
  rest. Across a project, page items carry `website`.
- `distributions.browsers | operatingSystems | devices | traffic`: shares of the total.
- `availability.state`: `complete`, `processing` or `incomplete` (recent data may still grow),
  `unavailable`.
- Actions report: `rows` (page, action, kind, count, visitors, pageViews of that page), `actions`
  (totals per action across pages), `other` (what is beyond the rows).
- A range is at most 30 days. Data older than the project's retention period is not available.
