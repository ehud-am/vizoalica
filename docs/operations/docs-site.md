# Publishing this site

The documentation and promo site at **vizoalica.dev** is built from the `docs/` folder with
[VitePress](https://vitepress.dev) and hosted as static files on Cloudflare Pages. Every change to
`docs/` that reaches the main branch is built, checked, and published by a GitHub Actions workflow.
This guide is for the maintainer: it covers what runs, the one-time setup, how to check it, and how
to undo it.

Nothing in the repository creates a Cloudflare resource or changes your DNS for you. Until you do the
setup below, the workflow still builds and checks the site on every change; it just does not publish.

## What runs

| Event                                                                     | What happens                                                                                                                                                                                                                |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A pull request that changes `docs/` (or the files the site is built from) | The site is built and checked: accessibility in light and dark, response headers, no third-party requests, search, phone width, reading without JavaScript. Nothing is published and no Cloudflare credential is available. |
| A push to `main` with such a change                                       | The same build and checks, then **publish**, if the Pages project is configured. If it is not, the run reports a notice and skips publishing.                                                                               |
| **Run workflow** in the Actions tab (on `main`)                           | Same as a push to `main`. Use it for the first publish and to republish.                                                                                                                                                    |

The workflow is [`.github/workflows/docs-site.yml`](https://github.com/ehud-am/vizoalica/blob/main/.github/workflows/docs-site.yml).

## One-time setup

You need a Cloudflare account that has the `vizoalica.dev` zone, and admin access to the GitHub
repository. Six steps:

### 1. Create the Pages project

The project name sets the free `*.pages.dev` address, so `vizoalica` gives `vizoalica.pages.dev`. From
a checkout, signed in to Cloudflare:

```sh
pnpm exec wrangler pages project create vizoalica --production-branch main
```

### 2. Create a narrowly scoped API token

In Cloudflare, go to **My Profile → API Tokens → Create Token → Create Custom Token**, with a single
permission: **Account → Cloudflare Pages: Edit**, limited to this one account. Do not add zone, DNS,
or Workers permissions, and do not add IP address filtering (GitHub's runners have no fixed address).
Copy the token once; you will paste it into GitHub in the next step.

### 3. Give the workflow its three values

In GitHub, **Settings → Secrets and variables → Actions**, or with the `gh` CLI (which asks for the
token without echoing it):

```sh
gh secret set CF_DOCS_API_TOKEN
gh variable set CF_ACCOUNT_ID --body "YOUR_CLOUDFLARE_ACCOUNT_ID"
gh variable set VIZOALICA_DOCS_PAGES_PROJECT --body "vizoalica"
```

`CF_DOCS_API_TOKEN` is the only secret. The account ID and project name are not secret. Setting
`VIZOALICA_DOCS_PAGES_PROJECT` is what turns publishing on.

### 4. Protect the publishing environment (recommended)

The publish job runs in a GitHub environment named `docs-production`. In **Settings → Environments →
docs-production**, restrict **Deployment branches** to `main`, and optionally add **Required
reviewers**. Then only the main branch can reach the token, and (if you add reviewers) only after
approval. Also consider a branch protection rule on `main` that requires pull request review, since a
merge to `main` is what publishes.

### 5. Publish once

In **Actions → Docs site → Run workflow**, choose `main`. When it finishes, the site is live at the
project's `*.pages.dev` address, shown in the run log and in the Cloudflare dashboard under
**Workers & Pages → vizoalica**.

### 6. Attach the domain

In **Workers & Pages → vizoalica → Custom domains**, add `vizoalica.dev`, then `www.vizoalica.dev`.
Because the zone is on Cloudflare, the DNS records and certificates are created for you. To send `www`
to the apex, add a **Redirect Rule** from `www.vizoalica.dev/*` to `https://vizoalica.dev/${1}` (301).
Certificates can take a few minutes to become active.

## A copy on GitHub Pages

The same site is also published from this repository's GitHub Pages, at
`https://ehud-am.github.io/vizoalica/`, so the project is listed there as well as at vizoalica.dev.
It is a copy, not a second site: same pages, built to live under `/vizoalica/`.

[`.github/workflows/docs-github-pages.yml`](https://github.com/ehud-am/vizoalica/blob/main/.github/workflows/docs-github-pages.yml)
is separate from the Cloudflare workflow on purpose, so the Cloudflare token is never near it and this
one never has a secret. It builds the copy with `DOCS_BASE=/vizoalica/`, checks that every link, image,
and video resolves under that path, and publishes from `main`.

How it differs from vizoalica.dev:

- **Every page names vizoalica.dev as its canonical address**, so search engines treat the Cloudflare
  site as the original and the copy as a mirror. It has no sitemap for the same reason.
- **No analytics and no consent prompt.** The copy is built without the analytics variables.
- **No response headers.** GitHub Pages cannot serve the Content-Security-Policy in `_headers`, so
  the copy is served without it. The pages load nothing from another origin, so nothing is exposed,
  but the strict policy applies only to vizoalica.dev.

### One-time setup

You need admin access to the repository. Two commands, then a run:

```sh
gh api -X POST repos/ehud-am/vizoalica/pages -f build_type=workflow
gh variable set VIZOALICA_GITHUB_PAGES --body true
```

The first turns on GitHub Pages with **GitHub Actions** as the source, and GitHub creates a
`github-pages` environment that only the default branch can deploy to. The second is what turns
publishing on: until it is set, the workflow builds and checks the copy and reports a notice.

Then run **Actions → Docs site on GitHub Pages → Run workflow** on `main`. The address appears in the
run and under **Settings → Pages**.

Do not set a custom domain on GitHub Pages: `vizoalica.dev` belongs to the Cloudflare project.

### Change or remove it

Editing `docs/` updates both sites from the same commit. To remove the copy, delete the variable
(`gh variable delete VIZOALICA_GITHUB_PAGES`) and turn Pages off
(`gh api -X DELETE repos/ehud-am/vizoalica/pages`).

## Measure the site with Vizoalica (optional)

The site can count its own page views with the Vizoalica you run, after the visitor allows it. This
is the [GitHub Actions path](./pages.md#path-a-github-actions-recommended) from the activation guide,
built into this workflow instead of a separate one. Without the variables below the site is published
exactly as before, with no consent prompt and no analytics.

1. In the console, create a website for `https://vizoalica.dev` (the exact origin, no trailing slash).
   Its **Install** page lists the values below.
2. Add these public repository **variables** (Settings → Secrets and variables → Actions → Variables):
   `VIZOALICA_SDK_SRC` (`https://vizoalica.dev/vizoalica.js`), `VIZOALICA_INGEST_ENDPOINT`,
   `VIZOALICA_PUBLIC_SOURCE_KEY`, `VIZOALICA_PROJECT_ID`, `VIZOALICA_TOKEN_URL`
   (`/vizoalica/ingest-token`), `VIZOALICA_CONSENT` (`analytics-granted`, recorded because the loader
   runs only after the visitor allows it), `VIZOALICA_SOURCE_ID`, and `VIZOALICA_SITE_ORIGINS`.
3. Add one **secret**, `VIZOALICA_TOKEN_SECRET`: the same value your Worker uses to verify tokens
   (`gh secret set VIZOALICA_TOKEN_SECRET`). It is given to the Pages project by the publish step and
   never written to a file or to the site.
4. Run the workflow. Then check with `pnpm website:verify -- https://vizoalica.dev PROJECT_ID SOURCE_ID --mode dynamic`,
   open the site, choose **Allow analytics**, and watch the event arrive in the console.

Remove it by deleting `VIZOALICA_INGEST_ENDPOINT` and publishing again. Rotating the signing secret
follows [the activation guide](./pages.md#rotate-or-remove): change it on the Worker and here together.

## Check it

After the first publish and the domain step:

```sh
curl -sI https://vizoalica.dev/ | grep -iE "^(HTTP|content-security-policy|x-content-type-options|x-frame-options)"
curl -s https://vizoalica.dev/llms.txt | head -3
curl -s https://vizoalica.dev/sitemap.xml | head -c 300
```

You should see a `200`, a Content-Security-Policy that names only `'self'` and a few `sha256-` script
hashes, and a sitemap and `llms.txt` whose links begin with `https://vizoalica.dev`. Open the site in a
browser, play the intro video, and use search.

## Change or roll back

- **Change the site**: edit files in `docs/`, open a pull request, and merge it. Preview it locally
  first with `pnpm docs:dev` (live reload) or `pnpm docs:build && pnpm docs:preview`.
- **Add a page**: create the Markdown file and add it to `docs/.vitepress/navigation.ts`. A test fails
  if a file in `docs/` is not in the navigation.
- **Roll back**: in **Workers & Pages → vizoalica → Deployments**, choose an earlier deployment
  and **Rollback to this deployment**. Then revert the change in the repository so the next publish
  does not reinstate it.
- **Regenerate the images and video**: `pnpm promo:snapshots` then `pnpm promo:video` (needs `ffmpeg`).
  Commit the results.

## Remove it

1. Delete the custom domains from the Pages project, and any redirect rule.
2. Delete the Pages project (`pnpm exec wrangler pages project delete vizoalica`).
3. Delete the GitHub secret and variables, and the `docs-production` environment.
4. Revoke the API token in Cloudflare.

The workflow then keeps building and checking the site but skips publishing.

## Security model

- The workflow's GitHub token can only read the repository. Cloudflare is reached with a separate
  token that can only edit Pages on one account.
- The token is a repository secret used in one step of one job. That job never runs for a pull request
  (so never for a fork), only runs for the `main` branch, and runs in an environment you can lock down.
- Third-party actions are pinned to full commits. Publishing uses the repository's own locked
  Wrangler, not an action from someone else.
- The site loads nothing from another origin. Its only analytics are Vizoalica's own, sent to the
  maintainer's own ingestion Worker (never a third party), and only after a visitor chooses **Allow
  analytics**. Until then nothing is loaded or sent. A browser that sends Global Privacy Control or
  Do Not Track is never asked. The site is served with a Content-Security-Policy that allows scripts
  only from its own files and the few inline scripts the site generator writes (allowed by hash,
  computed at build time), lets the page send data only to itself and that one Worker origin (added
  at build time from a public variable), plus `nosniff`, a strict referrer policy, and frame denial.
  The header file is [`docs/public/_headers`](https://github.com/ehud-am/vizoalica/blob/main/docs/public/_headers).
- Tests fail if any of this is weakened: the workflow's permissions, action pinning, secret use, and
  publish conditions, and the site's headers, third-party requests, and accessibility.

## Cost

Cloudflare Pages serves static files without metering requests or bandwidth, and a documentation site
of this size stays far inside the free plan's other limits; check Cloudflare's current pricing and
limits page if you want the exact numbers. This site publishes at most once per merge. There is no
server, database, or storage to pay for. The only recurring cost is the domain registration you
already have. See [Vizoalica's cost model](./cost-model) for the analytics backend, which is a separate
matter.
