# Vizoalica brand identity

## Concept

The mark is a magnifying glass: a lens (a stroked circle) with a handle at
the lower right, and a small dot at the center of the lens standing in for
the one data point an operator is looking for. It reads clearly at both
icon and lockup scale, and it is original artwork - not a modified
third-party icon or font glyph.

## Palette

| Role                | Hex       | Used for                                   |
| -------------------- | --------- | ------------------------------------------- |
| Brand green          | `#215c42` | Lens stroke and handle on light backgrounds, mark background square |
| Brand green (white)  | `#ffffff` | Lens stroke and handle on dark backgrounds |
| Accent amber         | `#d08a31` | The center dot, on every variant, on every background |
| Ink (light bg text)  | `#18211d` | Wordmark text on light backgrounds |

The accent dot color never changes with theme or background - it is the
one fixed, recognizable color across every placement.

## Assets

All assets live in `apps/admin-web/public/brand/`:

- `vizoalica-mark.svg` - the lens+handle mark alone, on a rounded brand-green
  square. Use as a standalone app icon (e.g. a bookmark tile or app-picker
  icon), never inline next to the "Vizoalica" wordmark (the topbar already
  pairs a plain mark with text; this variant's own background would double
  up).
- `vizoalica-lockup-dark.svg` - mark + wordmark in white, for dark
  backgrounds.
- `vizoalica-lockup-light.svg` - mark + wordmark in brand green / ink, for
  light backgrounds.
- `vizoalica-monochrome.svg` - mark + wordmark in a single `currentColor`
  ink (including the dot), for one-color contexts: print, a colored surface
  outside the approved backgrounds below, or anywhere the accent amber
  would fail contrast.
- `favicon.svg` - a favicon-optimized version of the mark: heavier stroke
  weights and a bigger dot so it stays legible at 16-32px browser-tab
  sizes. Installed via `apps/admin-web/index.html`.

## Clear space

Keep clear space around every variant equal to the height of the lens
circle (the `r="14"`/`r="15"` circle in each SVG's own viewBox units) on
every side. Do not crop the handle or crowd the wordmark against other UI.

## Minimum sizes

- `vizoalica-mark.svg`: 24px square minimum. Below that the lens ring and
  handle merge visually.
- `vizoalica-lockup-dark.svg` / `vizoalica-lockup-light.svg`: 120px wide
  minimum. Below that the wordmark stops being legible before the mark
  does.
- `vizoalica-monochrome.svg`: same 120px minimum as the lockups (same
  proportions).
- `favicon.svg`: designed for 16px; the mark stays legible down to that
  size specifically because of its thicker strokes relative to
  `vizoalica-mark.svg`. Do not use `favicon.svg` above 48px - use
  `vizoalica-mark.svg` instead, which reads better at larger sizes.

## Approved backgrounds

- `vizoalica-lockup-light.svg` and `vizoalica-mark.svg`'s own green square:
  approved on white and on the app's light-theme surface tokens
  (`--color-surface-raised`, `--color-surface-page`).
- `vizoalica-lockup-dark.svg`: approved on the app's dark-theme surface
  tokens and on the solid brand green (`#215c42`).
- Never place `vizoalica-lockup-light.svg` on a dark surface or
  `vizoalica-lockup-dark.svg` on a light surface - both fail contrast.
  Use `vizoalica-monochrome.svg` (recolored via `currentColor`) for any
  background outside this list.

## Accessible naming: meaningful vs. decorative

- **Meaningful** (the logo stands alone as the thing identifying the
  product - a favicon-adjacent app icon, a document header, a standalone
  brand mention): use `vizoalica-mark.svg`, `vizoalica-lockup-dark.svg`,
  `vizoalica-lockup-light.svg`, or `vizoalica-monochrome.svg`. Each already
  carries `role="img"` and a `<title id="...">Vizoalica</title>` wired
  through `aria-labelledby`, with an id unique to that file so multiple
  variants can be inlined on one page without id collisions.
- **Decorative** (the logo sits next to visible "Vizoalica" text that
  already names the product, or it is browser chrome like a favicon):
  mark it `aria-hidden="true"` so assistive technology does not announce
  it twice. `favicon.svg` intentionally ships with no title or role at
  all - a favicon is never in the accessibility tree in the first place.
  The app's topbar (`apps/admin-web/src/App.tsx`) follows this rule: the
  inline mark is `aria-hidden="true"` and the link around it carries
  `aria-label="Vizoalica home"` once, naming the whole lockup a single
  time rather than twice.
