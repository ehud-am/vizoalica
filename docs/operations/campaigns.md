---
title: 'Campaigns'
description: 'See which tagged links (UTM source, medium, and campaign) bring visitors, without cookies or visitor IDs: how to tag links, what is stored, and how to read the report.'
---

# Campaigns

A campaign is a link you share with three labels added to it, so you can see which of your efforts brought
visitors: a newsletter, a social post, an ad. The console's **Campaigns** page and the AI assistant's
`get_campaigns` tool report page views and visitors by source, medium, and campaign.

## Tag a link

Add up to three `utm_` parameters to the address you share:

```text
https://example.com/pricing?utm_source=newsletter&utm_medium=email&utm_campaign=spring-sale
```

| Parameter      | What it names                        | Examples                      |
| -------------- | ------------------------------------ | ----------------------------- |
| `utm_source`   | Where the link was placed            | `newsletter`, `twitter`, `hn` |
| `utm_medium`   | The kind of channel                  | `email`, `social`, `cpc`      |
| `utm_campaign` | The named effort the link belongs to | `spring-sale`, `launch-week`  |

You do not need all three; a link with only `utm_source` is reported with the other two shown as
"(not set)". Nothing needs to be installed beyond the script tag your website already has, as long as it
runs an SDK from 0.11 and your backend is updated (see [Update the backend](#update-the-backend)).

## Read the report

**Console:** Analytics → **Campaigns**. For the project or website and range chosen under the header it shows:

- campaign page views, visitors, and what share of all page views came from a tagged link;
- page views from tagged links over time;
- the top sources, mediums, and campaigns, each with page views and visitors;
- the top source, medium, and campaign combinations.

Choose a source, medium, or campaign to narrow the page. The selection is kept in the address, so you can
bookmark it or send it to another console user. Nothing on the page changes a setting.

**AI assistant:** ask "which campaign brought the most visitors last week?". The `get_campaigns` tool takes the
same environment, project, website, and range arguments as the other tools, plus `source`, `medium`, and
`campaign` (exact labels). See [Ask your AI assistant](ai.md).

## What is stored

- **Only these three labels**, read from the address of the page the visitor lands on. Every other query
  parameter (including `utm_term`, `utm_content`, `gclid`, `fbclid`, and anything that looks like an email
  address or a token) is still dropped, exactly as before.
- **Cleaned before they leave the browser, and cleaned again by the backend.** Labels are lowercased
  (`Newsletter` and `newsletter` are one source), emails become `[email]`, long digit runs `[number]`, and
  token-like words `[token]`. Only letters, digits, spaces, and `_ - . + : /` are kept, and each label is cut
  to 64 characters. A label that is empty after cleaning is treated as not set.
- **Only the landing page view carries the labels.** Moving around a single-page site afterwards does not count
  the visit again.
- **Visitors** are counted like in every other report: a keyed digest that changes every day, so nothing is
  stored in the browser and no visitor identifier is returned.
- Aggregates are kept for 32 days, like the other reports.

The labels are text you wrote into your own links, not information about the visitor. If you put personal data in
a label anyway, the cleaning above removes the common forms, but the best protection is not to put it there.
See the [campaign labels privacy review](../privacy/campaign-labels-review.md).

## Limits

- Referrers are reported separately on **Sources**. A visit can have a campaign, a referrer, both, or neither;
  the two are not merged.
- A visit is attributed on its landing page only. There is no attribution across visits or sessions, because
  Vizoalica keeps no visitor identifiers.
- The page shows the 20 largest entries of each list and the 50 largest combinations; the rest is summed as
  "Other", so the totals stay exact.
- `utm_term` and `utm_content` are not collected.

## Update the backend

Campaign reports need the current backend and one additive database migration (`0005_campaign_reports.sql`).
Update with `vizoalica deploy <name> --update`; see [database and Worker versions](schema-versions.md).

Update the backend **before** bundling the new `@vizoalica/browser-sdk` into a website: a backend older than
0.11 rejects page views that carry campaign labels. A website that loads the SDK from its own backend (the
default) gets the matching SDK automatically (browsers may keep the old file for up to an hour). Only page views received after the update are counted, and the
page says so when the chosen range starts earlier.
