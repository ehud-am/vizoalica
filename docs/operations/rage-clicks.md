---
title: 'Rage clicks'
description: 'See which buttons and links visitors click repeatedly in quick succession, without cookies, visitor IDs, or click positions: what counts as a rage click, what is stored, and how to read the report.'
---

# Rage clicks

A rage click is a burst of rapid clicks on one button or link: 3 or more within a second. It usually means a
control that looks like it should respond and does not, a slow action, or a link that goes nowhere. The console's
**Rage clicks** page and the AI assistant's `get_rage_clicks` tool list the controls where it happens most.

Nothing needs to be installed beyond the script tag your website already has, as long as it runs an SDK from 0.12
and your backend is updated (see [Update the backend](#update-the-backend)).

## What counts

- **3 or more clicks on the same control within 1 second**, with a mouse or by touch. The control is the same
  button or link, on the same page, with the same name and destination.
- **One burst is reported at most once every 5 seconds per control**, and at most 20 bursts a minute per page
  load, so a visitor hammering a button or a script cannot flood the backend.
- **Keyboard activation is not counted.** Holding Enter or Space repeats clicks without frustration, so only
  mouse and touch clicks count.
- The clicks themselves are recorded as ordinary [actions](browser-sdk.md#actions-clicks-on-buttons-and-links);
  the burst is an extra signal and does not add to the click counts.
- Only the controls that are already recorded as actions can have a burst: buttons, links, and button-like
  controls. Clicks on plain text, images, or empty space are not recorded at all. Controls marked
  `data-vizoalica-ignore` are skipped.

## Read the report

**Console:** Analytics → **Rage clicks**. For the project or website and range chosen under the header it shows:

- the number of bursts and of all clicks in the range;
- bursts over time;
- the controls with the most bursts, each with its page, its bursts, all its clicks, and bursts per click. A
  control name links to its row in the Actions report.

Nothing on the page changes a setting.

**AI assistant:** ask "where are people rage clicking this week?". The `get_rage_clicks` tool takes the same
environment, project, website, and range arguments as the other tools, plus `page` and `action` (exact values).
See [Ask your AI assistant](ai.md).

## What is stored

- **A count per minute, page, and control** (name, kind, and the destination of a link, as for actions). Nothing
  else.
- **No visitor identifier, no session, and no click position.** A burst is not linked to a person, so the report
  cannot say how many different visitors raged; one visitor hammering a button three times a day shows as three
  bursts.
- Names are the same redacted labels as for actions: emails become `[email]`, long digit runs `[number]`, and
  token-like words `[token]`.
- Aggregates are kept for 32 days, like the other reports.

See the [rage clicks privacy review](../privacy/rage-clicks-review.md).

## Limits

- **Clicks and the rate are rough.** The SDK records repeat clicks on one control within 500 ms once, so a control
  that is hammered shows only one or two ordinary clicks per burst. "Clicks" is the number of recorded clicks, not
  every physical click, and "bursts per click" can approach 100% on a control that is hammered every time. Use it
  to rank controls, not as a precise rate.
- **Look-alike controls merge.** Controls on one page with the same name and destination count as one control, so
  clicks spread over three "Remove" buttons can add up to a burst. A triple click on one control counts as a burst.

- It cannot tell frustration from a double-click on a slow page or from a control that is meant to be pressed
  repeatedly (a stepper, a counter). Read a burst as a prompt to look, not as a verdict.
- It shows controls, not where on the screen the clicks landed. Vizoalica does not record click positions.
- A click that does nothing (a "dead click") is not reported. That needs watching the page after each click and is
  not part of Vizoalica.
- The page shows the 50 controls with the most bursts; the rest is summed as "Other", so the total stays exact.
- Bursts are counted from the time of the update. The page says so when the chosen range starts earlier.

## Update the backend

Rage click reports need the current backend and one additive database migration (`0007_rage_click_reports.sql`).
Update with `vizoalica deploy <name> --update`; see [database and Worker versions](schema-versions.md).

Update the backend **before** bundling the new `@vizoalica/browser-sdk` into a website. The SDK sends bursts in
their own request, so a backend older than 0.12 rejects only the bursts, never page views or ordinary clicks. A
website that loads the SDK from its own backend (the default) gets the matching SDK automatically (browsers may
keep the old file for up to an hour).
