# Design: Website Administration Pages and Installation Flow

**Feature**: [spec.md](./spec.md) · **Date**: 2026-09-19 · **Status**: Draft, decided for implementation

This is the reasoning behind the spec: what is wrong today, what people are trying to do, the
options considered, and why the chosen shape wins. It is a design record, not a requirement list.

## 1. What is wrong today

### Websites page (`manage/websites`)

One screen does five jobs at once: list the websites, add a website, show one website's details,
edit it, and hold its disable and delete actions. Concretely:

1. **Two forms are on screen together.** "Add a website" sits under the list and "Edit website"
   sits in the detail column. They have the same fields (name, allowed origins), so it is not
   obvious which one you are looking at or which button saves what.
2. **The list and the detail are coupled through a hidden global.** Clicking a card changes the
   shell's Website selector, which is app-wide state. The card is a list item, a selector, and a
   navigation link all at once. The detail column is blank ("Select a website…") until you pick
   one, which is what a first-time visitor sees.
3. **Forms are always open.** An edit form is permanently rendered for a website you only wanted
   to look at, and its Save button is live even if nothing changed.
4. **No place for a website.** There is no address for "this website", so nothing can link to it,
   the back button cannot return to it, and Installation and Health cannot say "for Docs" without
   relying on the global selector.
5. **Installation is a separate top-level item that then asks which website.** "Installation" in
   the navigation is a noun with no object; you open it and are asked to choose a website.

### Installation page (`manage/installation`)

1. **The chooser is a form control for a decision that is not a setting.** A radio group titled
   "Installation option", with a bordered card per choice, reads like a preference to be saved.
   It is not; it is "which route am I taking?", and it decides which steps follow.
2. **The labels are implementation names.** "Static snippet" and "Dynamic configuration" describe
   how the values reach the browser. They do not say what to do or when to choose either. A person
   wants to know: "Does my site deploy from GitHub to Cloudflare Pages? Do I just paste something?"
3. **Nothing says which to pick.** The docs recommend the GitHub Actions path; the page does not.
4. **A warning appears after you act.** "Remove or disable the other installation path before
   switching…" only appears once you switch, when it is too late to shape the decision.
5. **The dynamic path is a wall.** Its steps are numbered "1." and "2." but the loader tag above
   them is unnumbered, and step "3. Or run this from your terminal" is an alternative to step 2
   that reads as the next step. Account-specific variables and secrets hide inside a paragraph.
6. **Identifiers lead the page.** Three IDs with jargon ("Source ID (for the token issuer)") come
   before anything you can act on.
7. **The static path leaves out half the job.** A page snippet alone does not work: the site also
   needs the SDK file and a token endpoint that signs with the shared secret. Only the docs say so.
8. **There is no finish line.** Nothing helps you confirm it works. The page ends with a long
   sentence about consent.

## 2. What people are trying to do

| Job | Frequency | What they need |
|---|---|---|
| See my websites and whether they are on | Often | A calm list, no forms |
| Open one website | Often | A page of its own, with an address |
| Fix a name or an origin | Occasionally | A focused form, a clear way back, no accidental loss |
| Add a website, then get it collecting | Rarely, but it is the first-run job | One flow: create, install, check |
| Copy the install code again | Occasionally | Reach it from the website in two clicks |
| Turn off or remove a website | Rarely | Separate, deliberate, clearly named |

## 3. Options considered

### For the website screens

| Option | Verdict |
|---|---|
| **A. Keep master and detail on one page, just tidy it** (collapse the forms, add a placeholder) | Rejected. It keeps the coupling to the shell selector and the two-forms problem, and does not answer the request for an edit page with a back button. |
| **B. List page, then a page per website, then focused edit and add pages** | **Chosen.** Each page has one job, one address, and one way back. |
| **C. Modal or drawer forms over the list** | Rejected. Poor on phones, no address to link or return to, and harder to make accessible than a page. |
| **D. Inline editing on the website page** | Rejected. It puts an always-live form back on the detail page and blurs "look" and "change". |

### For the install choice

| Option | Verdict |
|---|---|
| **A. Keep radio buttons, improve wording** | Rejected. Fixes the labels but keeps the form-setting feel and the late warning. |
| **B. Tabs of two equal panels** | Close, but a tab strip hides the explanation of each path until you click it. |
| **C. A wizard that asks questions ("Do you use GitHub?") then shows one path** | Rejected. Too heavy for two paths, hard to go back and compare, and it hides the other option from people who want it. |
| **D. Two "path" cards with a plain-language description each, using tab semantics, with a recommended badge, over numbered steps for the chosen path** | **Chosen.** The explanation is visible before choosing, the choice is framed as a route, and the steps below change with it. |
| **E. One long page showing both paths in full** | Rejected. It is the current wall, doubled. |

## 4. The chosen shape

### 4.1 Website pages

```text
Manage
  Projects
  Websites ─┬─ list                       #/manage/websites
            ├─ add                        #/manage/websites/new
            └─ one website                #/manage/websites/:id
                 ├─ edit                  #/manage/websites/:id/edit
                 └─ install               #/manage/websites/:id/install
  Health                                  #/manage/health
```

- **List.** Cards in a grid, one per website: name, first origin (and "+2 more"), status. The card
  is a single link to the website's page. "Add website" is the one primary button. No forms.
- **Website page.** The hub for one website. Breadcrumb "Websites › Docs", a status badge, and
  three plain actions: **Edit**, **Install**, **View analytics**. Below: details (origins,
  identifiers with copy), a live status card (collection, reachability), and a danger zone.
- **Edit page.** Only the form. A back link to the website page, Save and Cancel. Save is enabled
  only when something changed. Leaving with unsaved changes through Cancel or the back link asks
  first. Saving returns to the website page with a confirmation.
- **Add page.** Only the form, with the project as its first field as before. Saving lands on the
  new website's **Install** page with "Website created. Next: install it."
- **Scope.** A website page is addressed by its URL, so the shell's Website selector is hidden
  there. Its project is shown in the breadcrumb. The list keeps only the Project selector. The
  "View analytics" action sets the website as the analytics scope on the way through.
- **Navigation.** "Installation" leaves the primary navigation, because installing is something you
  do to a website. It is reachable from the website page and from the "check the installation"
  hint on Analytics. Manage becomes Projects, Websites, Health.

### 4.2 Install page

```text
Install Docs
Add the code, deploy, then check that data arrives.

How does this website get deployed?
┌────────────────────────────────┐ ┌────────────────────────────────┐
│ GitHub → Cloudflare Pages      │ │ Paste a snippet                │
│ [Recommended]                  │ │                                │
│ Push to deploy. A workflow     │ │ Add one script tag to your     │
│ ships your site with the       │ │ pages yourself. Works with any │
│ analytics settings. Nothing    │ │ host; you provide the token    │
│ private is committed.          │ │ endpoint.                      │
│ dynamic configuration          │ │ static snippet                 │
└────────────────────────────────┘ └────────────────────────────────┘
Use one path per website so analytics starts once.

Steps for the chosen path, each with one action and one code block:

GitHub → Cloudflare Pages          Paste a snippet
 1 Add the loader to your pages     1 Add the snippet to your pages
 2 Add the deploy workflow          2 Host the SDK and a token endpoint
 3 Add the settings and secrets        (identifiers table with copy)
   (GitHub website | gh commands)   3 Deploy your website
 4 Push to deploy                  
 5 Check it works                   4 Check it works

Check it works (shared):  [Check now]
   ✓ Receiving data: 12 page views in the last 24 hours    → View analytics
   ✗ Nothing yet. Open your website, allow analytics, then check again.
   Configuration file: reachable / unreachable  (GitHub path only)

▸ Identifiers (project, source, public key)     ▸ Using another host? Use the generic loader
```

Why these choices:

- **Words describe the situation, jargon is secondary.** "GitHub → Cloudflare Pages" and "Paste a
  snippet" say what you do. "dynamic configuration" and "static snippet" stay as small print so the
  docs and the page still match.
- **Recommended badge on the path the docs recommend.** It is the default, so most people never
  decide anything.
- **The warning moves up front** as a permanent line under the cards, not a reaction to a click.
- **One alternative per step, not three numbered steps.** The old steps 2 and 3 were the same
  thing done two ways. They become one step with a two-way toggle: "GitHub website" or "GitHub CLI".
- **Secrets are named in a small table**, not buried in a sentence: each name, whether it is a
  public variable or a secret, and where the value comes from.
- **The static path states the token endpoint requirement**, which today only the docs mention.
- **A real finish line.** "Check now" reads two existing read-only endpoints: reachability of the
  configuration file (GitHub path) and page views for this website over the last 24 hours. Success
  is receiving data, not "the tag is on the page".
- **Identifiers are reference material,** so they are collapsed at the end (and shown where a step
  needs them).
- **The generic loader for other hosts** stays available, inside a disclosure in the paste path.
- **The path is remembered per website** in the browser, so coming back does not re-ask.

### 4.3 Why not more

- No new endpoints, no data change, no change to what the local API generates. The API still
  returns both installation modes; this is a presentation and navigation change.
- The list does not show per-website health. It would need one status call per card. Health
  stays on its own page and on the website page.
- No wizard or progress persistence across sessions. The finish line is computed from real data.

## 5. Risks

| Risk | Mitigation |
|---|---|
| Removing "Installation" from the navigation strands people who look for it there | Website page has an Install action; the Analytics hint links to it; docs updated |
| A deep link to a website in another project | The page says the website is not in the current project and links back to the list |
| The "Check now" result misleads on a quiet site | The text says exactly what was checked (last 24 hours, page views) and what to do next |
| Losing edits | Dirty-form guard on in-page leave controls; Save only enabled when changed |
| Existing tests and docs reference the old layout | Updated as part of the work; the QA report lists what changed |
