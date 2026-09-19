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
- The site loads nothing from another origin, has no analytics or tracking, and is served with a
  Content-Security-Policy that allows scripts only from its own files and the few inline scripts the
  site generator writes (allowed by hash, computed at build time), plus `nosniff`, a strict referrer
  policy, and frame denial. The header file is [`docs/public/_headers`](https://github.com/ehud-am/vizoalica/blob/main/docs/public/_headers).
- Tests fail if any of this is weakened: the workflow's permissions, action pinning, secret use, and
  publish conditions, and the site's headers, third-party requests, and accessibility.

## Cost

Cloudflare Pages serves static files without metering requests or bandwidth, and a documentation site
of this size stays far inside the free plan's other limits; check Cloudflare's current pricing and
limits page if you want the exact numbers. This site publishes at most once per merge. There is no
server, database, or storage to pay for. The only recurring cost is the domain registration you
already have. See [Vizoalica's cost model](./cost-model) for the analytics backend, which is a separate
matter.
