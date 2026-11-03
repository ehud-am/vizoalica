---
title: 'Goals'
description: 'Count conversions for a website: a page view of a path, a click on a button or link, or a custom event. Aggregate counts only, no visitor identifiers.'
---

# Goals

A goal says what counts as a conversion on one website. The console's **Goals** page and the AI assistant's
`get_goals` tool show how many visits reach it. Goals add no tracking: they are counted from the page views,
actions, and custom events the website already sends.

## Three kinds of goal

| Counts    | Target                                  | Example            |
| --------- | --------------------------------------- | ------------------ |
| Page view | A page key, starting with `/`           | `/thanks`          |
| Click     | An action name, as shown in **Actions** | `Start free trial` |
| Event     | A custom event name                     | `signup`           |

A website can have up to 20 goals. A click goal counts every control with that name, on any page. A page goal
matches the page key exactly, after [grouping rules](page-grouping.md) have been applied.

## Add a goal

**Console:** Manage → Websites → the website → **Goals** → name, what it counts, and what to count → **Add goal**.
Delete a goal there too. Adding and deleting need a website-owner key or the admin key; an analyst key can only
read the report.

**Pipeline:** use the backend's admin API with a website-owner or admin key:

```sh
curl -X POST "$ENDPOINT/v1/admin/projects/$PROJECT/sources/$WEBSITE/goals" \
  -H "authorization: Bearer $VIZOALICA_KEY" -H 'content-type: application/json' \
  -d '{"name":"Signed up","kind":"event","target":"signup"}'
```

`GET` on the same path lists the goals, `DELETE .../goals/<id>` removes one.

## Read the report

**Console:** Analytics → **Goals**, with a website chosen under the header. For each goal it shows conversions,
distinct visitors who converted, and the rate. **AI assistant:** ask "how are my goals doing this week?"; the
`get_goals` tool takes the usual environment, project, website, and range arguments.

- **Rate** is converted visitors over all visitors in the range. Visitors are counted per day, as everywhere
  else in Vizoalica, so a visitor who returns on another day counts again.
- **A page goal has no visitor figure.** Page views are not kept per visitor, so a page goal reports page views
  and its rate is its share of all page views. Use a click or an event goal when you need visitors.
- **A new goal also covers earlier days.** Conversions are read from existing counts, so a goal added today
  includes the past 32 days of data (the retention period) for pages, and for clicks and events from the time
  those reports began.

## What is stored

A goal is a name, a kind, and a target, kept with the website. Conversions are counted from the existing
aggregates. No visitor identifier is added, and nothing about a converting visitor is kept beyond the daily
digest the other reports already use.

## Not in this release

Conversions by referrer or campaign, funnels (steps in order), and goal management from the command line. The
admin API above is available for pipelines.

## Update the backend

Goals need database schema 9. Update with `vizoalica deploy <name> --update`; the console says when a backend
is behind.
