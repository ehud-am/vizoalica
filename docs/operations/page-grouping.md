---
title: 'Group pages with rules'
description: 'Count many pages as one with path patterns, such as /blog/* as /blog/:post. Applied as events arrive, per website, with no regular expressions.'
---

# Group pages with rules

Vizoalica already groups identifiers: `/orders/8841` and `/orders/8842` both count as `/orders/:id`. Words in a
path, such as blog slugs, are left as they are, so each post is its own row. A **grouping rule** counts pages
that match a pattern under one page key.

## Write a rule

Console: Manage → Websites → the website → **Edit** → **Group pages**. One rule per line, a path pattern, then
`=>`, then the page key to count it under:

```text
/blog/* => /blog/:post
/docs/** => /docs/:page
/shop/*/reviews => /shop/:item/reviews
```

- `*` stands for exactly one whole path segment.
- `**` stands for the rest of the path, one segment or more. It can only be the last segment.
- Everything else matches literally. There are no regular expressions, so a rule can never be slow or unsafe.
- The first matching rule wins. At most 25 rules per website, 200 characters each.
- A `#/route` part of a page key (for single-page sites that use it) is kept after the new key.
- Patterns use letters, digits, and `- _ . ~ : @ % +`. The page key must start with `/` and carry no `?` or `#`.

**Pipeline:** `PATCH` the website with `{"groupingRules":[{"pattern":"/blog/*","key":"/blog/:post"}]}` through the
admin API. Send `[]` to remove all rules.

## When it applies

Rules are applied **when an event arrives**, after identifiers are grouped. They affect page views, actions, and
custom events from then on, and the no-script pixel. **Earlier data is not rewritten**: pages counted before the
rule keep their old keys until they age out after 32 days. Grouping lowers the number of distinct pages stored.

Goals and filters use the grouped key, so a page goal on `/blog/:post` counts every post.

## Update the backend

Grouping rules need database schema 9. Update with `vizoalica deploy <name> --update`.
