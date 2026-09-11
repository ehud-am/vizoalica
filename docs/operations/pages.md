# Connect a website with Cloudflare Pages

This recipe supplies the two pieces a static website is missing: **a browser bundle** and **a
server-side token Function**. Use it after deploying the Worker in the
[installation guide](cloudflare.md). The Function runs on Cloudflare, so your laptop can be off
while the website collects events.

Use a normal terminal with Cloudflare-native login for this recipe. OneCLI can still hold your
local console credential. Pages asset uploads use a temporary JWT that OneCLI 2.11's Cloudflare
injection was reported to overwrite; see [the known limitation](troubleshooting.md#onecli-and-pages-uploads).

For an existing Direct Upload project, the shortest path is the
[guided operations CLI](ops-cli.md): run `pnpm ops setup`, then `pnpm ops deploy-pages` to review
the target and repeat it with the printed project-name confirmation. The detailed recipe below is
still required for first-time project creation, SDK installation, and signing-secret setup.

## 1. Prepare the Pages project

From your Vizoalica checkout, choose an unused Pages project name and a private working copy for
the example. Replace the two paths/names below. The name determines your `pages.dev` origin.

```sh
export VIZOALICA_SITE_DIR="$HOME/vizoalica-demo"
export VIZOALICA_PAGES_PROJECT="YOUR_UNIQUE_PAGES_PROJECT"
mkdir -p "$VIZOALICA_SITE_DIR"
cp -R examples/cloudflare-pages/. "$VIZOALICA_SITE_DIR/"
cp "$VIZOALICA_SITE_DIR/wrangler.example.toml" "$VIZOALICA_SITE_DIR/wrangler.toml"
pnpm exec wrangler pages project create "$VIZOALICA_PAGES_PROJECT" --production-branch main
```

For an **existing** Pages project, skip creation and use its actual name and production branch.
Do not overwrite an existing site's files; copy the Function and SDK into its own structure as
explained below. Return to [installation step 5](cloudflare.md#5-create-one-project-and-website)
if you still need a project and source.

**Check:** the Pages project exists in the intended Cloudflare account. Record the exact origin
shown in the dashboard, normally `https://YOUR_UNIQUE_PAGES_PROJECT.pages.dev`.

## 2. Fill in the public configuration

Edit the working copy's `wrangler.toml`:

| Field                   | Copy from                                  |
| ----------------------- | ------------------------------------------ |
| `name`                  | Pages project name                         |
| `VIZOALICA_PROJECT_ID`  | Console's Integration snippet → Project ID |
| `VIZOALICA_SOURCE_ID`   | Console's Integration snippet → Source ID  |
| `VIZOALICA_SITE_ORIGIN` | Exact website origin, no trailing slash    |

Edit `public/index.html`, replacing its three `REPLACE_…` values with your Worker hostname,
public source key and project ID. The Worker hostname excludes `https://`; keep the full endpoint
ending in `/v1/events:batch`. The demo serves its SDK at `/vizoalica.js`.

**Check:** no `REPLACE_…` values remain in `wrangler.toml` or `public/index.html`. Do not put a
secret in either file. The source ID is **not** necessarily the public source key.

## 3. Build and copy the browser SDK

Run from the Vizoalica checkout:

```sh
pnpm browser-sdk:build
cp packages/browser-sdk/dist/vizoalica.js "$VIZOALICA_SITE_DIR/public/vizoalica.js"
```

**Check:** `public/vizoalica.js` exists in the website copy. This is a standalone IIFE bundle;
you do not need a JavaScript framework, CDN account, or an extra server. `pnpm build` builds the
workspace packages; `pnpm browser-sdk:build` is the explicit command for a script-tag bundle.
Rebuild and recopy it when upgrading Vizoalica.

Your website now has this structure:

```text
vizoalica-demo/
├── wrangler.toml
├── functions/
│   └── vizoalica/
│       └── ingest-token.ts
└── public/
    ├── index.html
    ├── vizoalica.js
    └── _routes.json
```

The [`Function source`](../../examples/cloudflare-pages/functions/vizoalica/ingest-token.ts) is
ready to deploy. It uses server configuration for project/source/origin, signs HS256 tokens with
Web Crypto, sets a five-minute lifetime and a 25-event token limit, and returns `text/plain` with
`Cache-Control: no-store`. Request parameters cannot select another project or origin. It rejects
missing configuration, foreign provenance and requests on unconfigured preview domains.

A public website token issuer is not visitor authentication: non-browser callers can forge origin
headers. Keep ingestion quotas enabled and use your existing session authentication if the site
is private. The shared signing secret stays on trusted servers.

## 4. Save the same signing secret on Pages

Paste **the same `VIZOALICA_TOKEN_SECRET` value used by the ingestion Worker** into the hidden prompt:

```sh
pnpm exec wrangler pages secret put VIZOALICA_TOKEN_SECRET --project-name "$VIZOALICA_PAGES_PROJECT" --cwd "$VIZOALICA_SITE_DIR"
pnpm exec wrangler pages secret list --project-name "$VIZOALICA_PAGES_PROJECT" --cwd "$VIZOALICA_SITE_DIR"
```

**Check:** the name exists on both the Worker and Pages project. Secret listing cannot prove their
values match; the browser's accepted event in step 6 does. Do not create a second signing value
for Pages. The administrator secret and Cloudflare deployment token never go on this website.
For an existing project with separate preview/production settings, confirm the secret and variables
in the **Production** environment in the dashboard, then redeploy for changes to take effect.

## 5. Deploy the website and Function together

For this Direct Upload example, run from the Vizoalica checkout:

```sh
pnpm exec wrangler pages deploy public --cwd "$VIZOALICA_SITE_DIR" --project-name "$VIZOALICA_PAGES_PROJECT" --branch main
```

**Check:** the deployment output says the Functions were compiled/uploaded, as well as the assets.
Verify the stable production origin from step 1. The unique preview URL printed for a deployment
is not automatically an allowed analytics origin.

`--cwd` is essential: Wrangler must start in the website project to discover its `functions/`
directory. Passing an absolute asset directory from another working directory can upload HTML
without the Function. `functions/` belongs beside `public/`, **not inside it**. These locations and
flags follow Cloudflare's [Function setup](https://developers.cloudflare.com/pages/functions/get-started/)
and [Pages command reference](https://developers.cloudflare.com/workers/wrangler/commands/pages/).

### Existing website: Git-connected or Direct Upload?

In Cloudflare **Workers & Pages → your Pages project**, inspect the connected repository and build
settings, production branch, and latest deployment commit. A Git-connected project has a repository
connection; a Direct Upload project does not gain one merely because your files are in Git.

| Project mode                                | Deploy changes                                                                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git-connected, automatic builds enabled     | Commit the site changes and `git push origin main` from the site repository (substitute its actual production branch). Confirm a new Cloudflare deployment for that commit. |
| Direct Upload, or intentional manual upload | Build locally, then use the `wrangler pages deploy … --cwd … --project-name … --branch …` command above. A Git push alone does nothing.                                     |

For a Git-connected site, ensure its build emits `vizoalica.js` into the configured output directory.
If using the prebuilt bundle, commit it as a website asset so the remote build actually has it.
The Function belongs in the configured project root and the output directory must contain
`_routes.json`. On an existing site, **merge** the example route into its routing configuration;
do not replace routes for other Functions. Likewise merge variables into its existing Wrangler
configuration rather than copying over its settings. If its production branch is not `main`, use
that branch in every command here.

See Cloudflare's [Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/)
and [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) guides.
Dashboard drag-and-drop does not compile a `functions/` directory; use Wrangler or a Git build.

## 6. Verify content, then a real event

From the Vizoalica checkout, substitute your stable origin, project ID and **source ID**:

```sh
pnpm website:verify -- https://YOUR_PAGES_PROJECT.pages.dev YOUR_PROJECT_ID YOUR_SOURCE_ID
```

**Check:** the command reports that website content and token claims passed. It checks:

- `/vizoalica.js`: successful status, JavaScript content type and parseable Vizoalica JavaScript.
- `/vizoalica/ingest-token`: `text/plain`, `no-store`, three JWT parts, HS256 header, expected
  project/source/origin, audience/scope, expiry and five-minute lifetime.

It sends a same-origin referrer like a browser GET. It never prints the token. It checks token
structure and claims, **not the signature**: only the Worker's accepted event proves that the
deployed signing secrets agree. An HTTP 200 alone is insufficient; Pages may return fallback HTML
for either missing path.

Now open the website and select **Allow analytics**. In the browser Network panel, confirm the
batch request to the Worker returns **202**, then refresh the local console's `24h` view. In a
fresh test source, one visit produces one page view and one privacy-safe unique user. See
[the installation checks](cloudflare.md#8-prove-a-page-view-arrived) for rejection and failure tests.
The demo makes the choice per visit; refresh to choose again.

## Add the integration to your own pages

Copy the complete snippet from the local console after hosting the SDK and token Function. It
uses the first configured website origin for `src` and your configured Worker for `data-endpoint`.
For several allowed origins, hosting at the same `/vizoalica.js` path lets you use a relative `src`.
Install on **every page or shared layout** where you want collection. Check the deployed page
source; an integration that used to exist in a sample repository may have been removed.

Only load the SDK after the visitor grants analytics consent, and set `data-consent` to
`analytics-granted` at that point. The attribute records consent; it is **not a consent banner or
an automatic collection gate**. Do not assume `unknown` prevents network requests. The included
demo delays loading the script until Allow is selected. For a production site, use its consent
manager and stop further tracking calls when consent is withdrawn.

For CSP-restricted sites, allow the SDK's host in `script-src` and the Worker origin in
`connect-src`; retain your existing policy. Keep same-origin referrers enabled for the token GET.
If your site deliberately uses `Referrer-Policy: no-referrer`, adapt its authenticated backend
rather than weakening this example's provenance check.

## Upgrade or rotate

Rebuild/copy the SDK, deploy the Function with the website, and rerun verification. For signing-key
rotation, pause collection, replace the secret on **both** Worker and Pages, redeploy, verify a
new token/event, then resume. This single-key example has no overlapping-key rotation; old tokens
will fail once the Worker key changes. Keep preview sources and secrets separate from production.
