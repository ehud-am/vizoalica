# Contract: Console shell

## Header
Left: brand. Right: `Environment ▾` menu, `Project ▾` menu (both hidden on the Projects page and the welcome/denied states except environment where usable), theme toggle. Environment first, project second.

## Environment menu
Button text = environment name; separate role badge; chevron in a reserved column. Items: name, role badge, disabled reason line. Footer entries (admin only): "Access keys". Keyboard: Enter/Space/Down opens, arrows move, Escape closes and returns focus, type-ahead optional. One environment: same button, no menu.

## Project menu
Items = the environment's active projects, current marked (`aria-checked`). Footer: "All projects…" → Projects page. No create/rename/delete. Empty: single item "Create your first project" → Projects page.

## Scope bar (below header)
Website and time range only, on routes that use them. No project select.

## Footer
One line: `Vizoalica · vizoalica.dev · GitHub`; the site and repo are links opening in a new tab with the existing accessible names; wraps without overlap at 320 px.

## Navigation
Analytics: unchanged. Manage: Websites, Health. Removed from primary nav: Projects, Backend, Access. Aliases: `#/manage/backend` renders Health. `#/manage/access` still resolves for administrators (renamed Access keys).

## Projects page
Create, rename, open (makes current and goes to Websites), delete (with the existing typed confirmation). Marks the current project.

## Health page
Section "Backend · whole environment" (versions incl. console version, database, storage) then "Websites · <project>".
