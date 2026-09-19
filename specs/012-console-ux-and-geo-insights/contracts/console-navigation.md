# Contract: Console Navigation and View/Manage Separation

## Routes (hash-based)

| Route | Area | Purpose |
|---|---|---|
| `#/analytics/overview` (default) | Analytics | Headline metrics with comparison, trend, top pages, sources, countries |
| `#/analytics/pages` | Analytics | Page ranking, complete list |
| `#/analytics/sources` | Analytics | Referrer ranking, complete list |
| `#/analytics/geography` | Analytics | World map, all countries, continent totals |
| `#/analytics/technology` | Analytics | Browsers, operating systems, devices |
| `#/analytics/traffic-quality` | Analytics | Human, bot, unknown |
| `#/manage/projects` | Manage | Create project; danger zone: delete project |
| `#/manage/websites` | Manage | List, add, edit, enable or disable; danger zone: delete website |
| `#/manage/installation` | Manage | Ordered installation steps for the scoped website |
| `#/manage/health` | Manage | Status and reachability for every website in scope |

Unknown routes redirect to `#/analytics/overview`.

## Rules

1. Every route belongs to exactly one area. Navigation shows two labelled groups, in this order:
   Analytics, Manage.
2. Analytics routes MUST NOT render any control that carries a capability tag with class
   `operate` or `administer`, and MUST NOT issue non-GET requests (the session bootstrap is the only
   allowed exception and is not a user action).
3. Every mutating control MUST carry `data-capability="<id>"` where the id exists in the capability
   matrix, and the matrix entry's area MUST equal the area of the route where it renders.
4. The shell scope control (project, website) is rendered on every scope-bound route. Manage >
   Projects is not scope-bound. The time range control is rendered on Analytics routes only.
5. The add-website form's first field is an explicit project choice (unchanged).
6. Destructive actions use the in-console confirmation (`role="alertdialog"`), which names the
   target and consequence, and focuses Cancel by default. Deleting a project additionally requires
   typing the project name.

## Capability ids

`view-analytics`, `view-health`, `view-installation`, `create-project`, `add-website`,
`edit-website`, `toggle-website`, `delete-website`, `delete-project`, `set-theme`.
