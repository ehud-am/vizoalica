---
name: vizoalica
description: Answer questions about Vizoalica, the self-hosted privacy-first web analytics that runs in the user's own Cloudflare account. Use for its analytics (traffic, top pages, referrers, countries, devices, clicks, period comparisons), the health of its environments and backends, whether a website is sending data, and how to install, set up, operate, or troubleshoot it. Read-only.
---

# Vizoalica

Vizoalica is open-source (MIT), self-hosted web and product analytics. A backend (a Cloudflare Worker with
D1 and R2) runs in the user's own Cloudflare account; websites send privacy-filtered page views, clicks
("actions"), and custom events to it; the `vizoalica` command on the user's computer manages it.

This skill is **read-only**. You may read analytics and health and explain what to do. You never
create, change, deploy, rotate, or delete anything yourself.

## Rules

1. **Say which environment.** A computer can hold several environments (`dev`, `stage`, `prod`), each a
   separate backend with separate data. Every MCP result starts with an `Environment:` line. Name the
   environment in every answer, and say so explicitly when you switch.
2. **Never handle secrets.** Never ask for, accept, print, or store an administrator secret, access key,
   `VIZOALICA_TOKEN_SECRET`, or Cloudflare token. If the user pastes one, tell them to rotate it
   (`vizoalica rotate <env> <admin|token|digest>`). Commands that create or show secrets
   (`vizoalica env add`, `vizoalica deploy`, `vizoalica rotate`) are for the user to run in their own
   terminal; give them the command, do not run it.
3. **Aggregates only.** Vizoalica has no per-visitor data, raw events, session replay, form values, or
   query strings. Do not promise them; explain that they are not collected by design.
4. **Be exact about time.** Ranges are UTC and at most 30 days per call. State the range you used. For
   longer questions, make several calls of 30 days or less and say so.
5. **Say when data is partial.** If `availability.state` is `processing` or `incomplete`, say recent
   numbers may still grow. Mark guesses as guesses.

## Tools (MCP server `vizoalica`)

If these tools are missing, the user can add them with `vizoalica mcp install --client <client>`
(clients: claude-code, claude-desktop, codex, cursor) and restart the client.

| Tool                     | Use it for                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `list_environments`      | Which environments exist, which work and why not, which one this session uses. Start here when unsure.                    |
| `use_environment`        | Switch this session's default environment (does not affect the console).                                                  |
| `get_environment_status` | Backend health: role, Worker and database versions vs this package, database/storage health, whether an update is needed. |
| `list_websites`          | Projects and websites (names, ids, allowed addresses, status).                                                            |
| `get_website_status`     | Is a website set up and sending data? Backend status plus a live check of the site's Vizoalica files.                     |
| `get_traffic_overview`   | Page views, unique visitors, trend, top pages, referrers, countries, browsers, OS, devices, bot vs human.                 |
| `compare_periods`        | This period vs the previous one (or any two periods): totals and pages that changed most.                                 |
| `get_actions`            | Clicks on buttons and links: which, on which page, how often, by how many visitors.                                       |

Every analytics tool takes `environment` (optional), `project` and `website` (name or id; `project` may be
omitted when there is only one, `website` omitted for the whole project), and either `preset`
(`last_24_hours`, `today`, `yesterday`, `last_7_days`, `last_14_days`, `last_28_days`, `last_30_days`) or
`start`/`end` (`YYYY-MM-DD` or ISO time, UTC, end exclusive).

## Recipes

- **"How is my site doing?"** `compare_periods` with `last_7_days`, then summarise totals with change,
  top pages, top referrers. Name environment and range.
- **"Which pages are popular?"** `get_traffic_overview`; across a project each page row names its website.
- **"What do people click on /pricing?"** `get_actions` with `page: "/pricing"`. Page keys group ids, so
  `/orders/8841` is `/orders/:id`.
- **"Is everything working?"** `list_environments`, then `get_environment_status` for the one in question.
  If a Worker or schema update is needed, give the command from the status message.
- **"Is my new site sending data?"** `get_website_status`; follow its `nextAction`. Then
  `get_traffic_overview` with `last_24_hours`. Zero with a healthy install usually means no one has visited
  since the tag went live, or the data is still processing (a minute or two).
- **"Compare prod and stage"** Call the same tool twice with `environment` set, and label each number.

More detail: [data model](reference/data-model.md), [setup and operations](reference/setup.md),
[troubleshooting](reference/troubleshooting.md).
