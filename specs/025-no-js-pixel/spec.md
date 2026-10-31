# Feature Specification: No-JavaScript Pixel

**Created**: 2026-10-27 · **Status**: Implemented for v0.13.0 (GitHub issue #47)

**Input**: "Count views of pages that cannot run JavaScript (a GitHub or npm README) with a 1x1 image request
that the backend counts as a page view."

## Decisions

| #   | Question                  | Decision                                                                                                                                                                  |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Route                     | `GET /v1/pixel.gif?website=<website-key>&path=<page key>`. `website` is the website key (the public value a script tag carries), the only public lookup the backend has.    |
| Q2  | Guardrail                 | Per-website switch `pixelEnabled`, off by default; migration `0008` adds `sources.pixel_enabled`. Events are tagged `vizoalicaauth: "pixel"` (a new trust level).          |
| Q3  | Response                  | Always `200` with a 1x1 GIF and `Cache-Control: no-store`, counted or not, so the route leaks nothing. `HEAD` is never counted.                                          |
| Q4  | Counting                  | One synthetic `page_view` event through the usual privacy guard, quota, raw archive and rollups. Visitors use the daily salted digest. Excluded addresses are dropped.     |
| Q5  | Path rules                | Starts with `/`, at most 512 characters, no `?`, `#` or control characters; otherwise not counted. Normalized like any page key.                                        |
| Q6  | Rate limit                | The same per-address limiter as event batches; over the limit still returns the image, uncounted.                                                                        |
| Q7  | Console                   | A switch on the website's Edit page; the website page shows the README snippet when on. Older backends (no `pixelEnabled`) get a hint to update.                         |
| Q8  | Known limits              | Image proxies (GitHub camo), generic referrers and blockers are documented in `docs/operations/pixel.md`.                                                                |
