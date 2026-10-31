---
title: 'Count views of a README or other no-script page'
description: 'Count views of pages that cannot run the script, such as a GitHub or npm README, with a 1x1 image request. Off by default, per website, with nothing stored in the browser.'
---

# Count views of a README or other no-script page

The script tag needs a page that can run JavaScript. A GitHub or npm README cannot, so it never shows up in
your numbers. The pixel is a 1x1 image that the page loads instead. Each load is one page view.

It is **off by default** and switched on **per website**.

## Set it up

1. In the console, open the website → **Edit** → **Count views from pages that cannot run scripts (pixel)**,
   and save. (Update the backend first with `vizoalica deploy <name> --update`; this release adds one database
   column.)
2. On the website's page, **No-script pixel** shows the line to paste. It is a Markdown image:

   ```md
   ![](https://<ingestion-endpoint>/v1/pixel.gif?website=<website-key>&path=/github/readme)
   ```

3. Give each page its own `path`, so views are told apart: `/github/readme`, `/npm/vizoalica`. It must start
   with `/`, be at most 512 characters, and carry no `?` or `#`. A path that does not meet this is not counted.

The same line works in any HTML too (`<img src="…" width="1" height="1" alt="">`).

## Fill it from your pipeline

To keep the endpoint and key out of a repository's README, put a block between two markers and let CI fill it:

```md
<!-- readme-pixel:start -->
<!-- readme-pixel:end -->
```

`scripts/readme-pixel.mjs <file> <path>` writes the image between them from `VIZOALICA_INGEST_ENDPOINT` and
`VIZOALICA_WEBSITE_KEY`, both public values, and leaves the block empty when
they are not set. Vizoalica's own repository does this, with path `/readme` for the repository README and `/npm/readme` for the npm README, so the two can be told apart in Pages: `.github/workflows/readme-pixel.yml` fills `README.md`
on a push to `main` and commits it, and the npm build fills the package README at publish time.

## What is counted

- One **page view** per image load, under the `path` you chose. It appears in Overview, Pages and real-time
  like any other page view.
- Unique visitors are counted as for the script: from the day's random salt, the visitor's address and user
  agent. Nothing is stored in the browser. The address is not stored.
- Pixel views are marked `pixel` in the raw event archive (`vizoalicaauth`), so they can be told apart there.
  The reports do not split them out.
- Quota applies like any event. [Exclude your own visits](internal-traffic.md) applies too.
- A `HEAD` request is never a view. The image is always answered the same way (`200`, `Cache-Control: no-store`),
  whether the view was counted or not, so the endpoint does not reveal which website keys exist.

## Why it is off by default

An image request carries no `Origin` header, so the backend cannot check where it came from, and anyone who
knows the website key (it is public) can request the image and add fake views. The script path has the same
exposure for a website without a token, but is limited to the allowed origins. Use a **separate website** for
READMEs and switch the pixel on only there, so forged views cannot touch your main site's numbers.

## Known limits

- **Image proxies.** GitHub rewrites README images through its own proxy (`camo`). The request then comes from
  GitHub, not the reader, and may be cached or collapsed: counts are rough and unique visitors cannot be
  counted. npm does similar. Treat the figure as a trend, not an exact count.
- **Generic or missing referrer.** The hosting page sends nothing useful, so the report cannot tell the source.
  Use a distinct `path` per README.
- **Blockers.** Ad and privacy blockers may drop the image.
- **Bots.** Crawlers that fetch images are counted by the same bot rules as other traffic.

See the [privacy review](../privacy/pixel-review.md).
