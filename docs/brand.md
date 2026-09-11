# Vizoalica brand system

Vizoalica's mark combines a structural **V** with an ascending three-node analytics graph. The geometry is custom vector artwork and the wordmark is outlined, so production rendering never depends on an installed font.

## Production assets

All runtime files live in `apps/admin-web/public/brand/` and use stable filenames:

- `vizoalica-mark.svg` — standalone V + graph symbol. Minimum size: 24px.
- `vizoalica-lockup-light.svg` — full dark-ink wordmark for light surfaces. Minimum size: 120px wide.
- `vizoalica-lockup-dark.svg` — full light-ink wordmark for dark surfaces. Minimum size: 120px wide.
- `vizoalica-monochrome.svg` — one-ink lockup for print or constrained contexts. Minimum size: 120px wide.
- `favicon.svg` — substrate-backed compact browser icon, optimized for 16–48px.

Source exploration belongs in `design/brand/references/`; only production-ready SVGs belong in the public asset directory. `design/brand/vizoalica-master.svg` is the editable canonical lockup.

## Clear space and color

Keep clear space equal to one graph-node diameter around the mark and lockups. Do not crop the graph nodes or recolor individual geometry. The core palette is graphite `#10141c`, electric blue `#168bff`, cyan `#12c5e8`, violet `#793dff`, and off-white `#f7f8fa`.

Use the light lockup on white and light graphite-neutral surfaces. Use the dark lockup on dark graphite surfaces. The favicon has its own dark substrate so it remains recognizable across browser themes.

## Accessibility

In product UI, place a decorative logo image (`alt=""`) inside a link or button with the accessible name **Vizoalica overview**. This prevents duplicate announcements while preserving the action's name. When a logo is meaningful standalone in a document, provide the accessible name in the embedding context. Favicons are decorative browser chrome and carry no accessible-name markup.

Never use the logo as the only indication of navigation state, status, or an action.
