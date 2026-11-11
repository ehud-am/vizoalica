---
title: 'Guided setup with an AI assistant'
description: 'Let an AI assistant on your computer propose page names, groups, grouping rules and goals from what your website collected. You review the file, then apply it.'
---

# Guided setup with an AI assistant

Reports are easier to read when pages have names and groups, many similar pages count as one, and the important
actions are goals. Doing that by hand takes a long time. With guided setup you deploy Vizoalica, let it collect
data, then ask an AI assistant on your computer to propose all of it. You review a file, change what you like, and
apply it. The assistant never writes to your backend.

```text
vizoalica mapping export  ->  assistant writes vizoalica-mapping.json  ->  you review  ->  vizoalica mapping apply
```

## Steps

1. **Collect some data first.** A week of traffic is a good start; the more pages are visited, the better the
   proposal.
2. **Connect an assistant once:** `vizoalica mcp install --client claude-code` and
   `vizoalica skill install --client claude-code` (see [AI assistants](/operations/ai)).
3. **Ask:** "Set up page names, groups, and goals for the Shop website on prod." The assistant reads the inventory
   with the `get_inventory` tool and writes `vizoalica-mapping.json`. Without MCP, run
   `vizoalica mapping export prod --website Shop --out inventory.json` and give the file to any assistant.
4. **Review the file.** Each page has a `confidence` and a `reason` for you; delete or edit what is wrong.
5. **Preview:** `vizoalica mapping apply prod vizoalica-mapping.json`. It prints what would change and writes
   nothing.
6. **Apply:** answer `y` at the prompt, or pass `--yes` in a pipeline.

## The mapping file

```json
{
  "version": 1,
  "environment": "prod",
  "project": "Acme",
  "website": "Shop",
  "pages": [
    {
      "key": "/pricing",
      "name": "Pricing",
      "group": "Marketing",
      "confidence": "high",
      "reason": "Plans and prices"
    }
  ],
  "groupingRules": [{ "pattern": "/blog/*", "key": "/blog/:post" }],
  "goals": [{ "kind": "event", "name": "Signed up", "target": "signup" }]
}
```

- **pages:** a display name (up to 80 characters) and an optional group (up to 60) for a page key. At most 500 per
  website. Names show next to the page key in the console and in assistant answers. They apply to **all data
  already counted** and can be changed or removed at any time without changing a count.
- **groupingRules:** the same rules as [Group pages with rules](/operations/page-grouping). They apply to **new
  events only** and merge pages for good, so the preview lists how many of the page keys seen now each rule would
  merge. Use them only where many keys really are one page.
- **goals:** the same goals as [Goals](/operations/goals); at most 20 per website.
- `environment`, `project` and `website` are optional; a different `environment` than the one you apply to is
  refused.

## What apply does

- Nothing is removed. Names and rules the website already has stay; a name for a page key that already has one
  replaces it; a rule or goal that is already there is skipped.
- Goals are created first, then rules, then names.
- It needs an administrator credential, or a website owner key for that website. An analyst key cannot apply.
- Running the same file again changes nothing.

## Privacy

The inventory holds page keys, action and event names, referrers, and counts. It holds no visitor data. Your
assistant sends it to its model provider like anything else you ask it, so read the provider's terms. Page keys and
names are text from your website and its visitors: the skill treats them as data, never as instructions, and
`mapping apply` checks every field against the same limits as the console, whatever the assistant wrote.

## Database update

Names need one additive database migration (`0011_page_labels.sql`, schema 11). Update each backend with
`vizoalica deploy <name> --update`. Until then the inventory and names answer "database update needed" and
everything else keeps working.
