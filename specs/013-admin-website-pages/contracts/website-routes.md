# Contract: Website Routes and Navigation (delta to spec 012)

## Routes

| Route | Key | Scope controls | Purpose |
|---|---|---|---|
| `#/manage/websites` | `manage/websites` | Project | List of cards, "Add website" |
| `#/manage/websites/new` | `manage/websites/new` | none | Add form (project first) |
| `#/manage/websites/:id` | `manage/websites/:id` | none | Website hub |
| `#/manage/websites/:id/edit` | `manage/websites/:id/edit` | none | Edit form |
| `#/manage/websites/:id/install` | `manage/websites/:id/install` | none | Path choice, steps, check |
| `#/manage/health` | `manage/health` | Project, Website | Unchanged |

Removed: `#/manage/installation`. An old link resolves to the default route.

## Rules

1. Primary navigation lists, under Manage: Projects, Websites, Health. Every `manage/websites/*`
   route marks Websites as current (`aria-current="page"` on the link when it is the page itself,
   and a visible current state otherwise).
2. Static routes match before parameterised ones (`new` is never an id).
3. A website route whose id is not among the current project's websites shows a not-found state
   with a link to the list, after the list has loaded. While it loads, a busy state is shown.
4. Pages with no scope controls show the project in a breadcrumb.
5. Every state-changing control carries a capability id; `add-website`, `edit-website`,
   `toggle-website`, `delete-website` are unchanged and remain Manage-only.
6. Confirmation messages that follow a navigation (save, create, delete) are shown once, on the
   destination, and cleared at the next navigation.

## Page structure (each website page)

`PageHeader`: breadcrumb (`Websites › <name> › <page>`), heading, optional back link and actions.
The Edit and Add pages render the header's back link as their first focusable element after the
skip target, and move focus to the first field on load.
