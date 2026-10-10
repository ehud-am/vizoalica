# QA Report: Modern Developer Console Design

**Date**: 2026-09-11  
**Feature**: `008-modernize-console-design`  
**Result**: Automated release gates pass; final human assistive-technology and optical sign-off remains a release-owner decision.

## Automated evidence

| Gate | Result |
|---|---|
| Formatting | PASS — all matched files use Prettier style |
| Lint | PASS |
| Type checking | PASS, including examples |
| Unit/integration tests | PASS — 88 files, 408 tests |
| Coverage | PASS — 96.53% lines, 90.27% branches |
| Production build | PASS — all workspace packages |
| Responsive browser suite | PASS — 6 Chromium scenarios |
| Accessibility scan | PASS — no serious or critical axe findings on Overview or Websites |
| Production dependency audit | PASS — no known vulnerabilities |
| SVG validation | PASS — all production assets and the master parse as XML |

The browser suite renders deterministic populated data at 320, 768, 1024, and 1440 pixels, verifies no page-level horizontal overflow, preserves an open custom-range draft through a wide-to-compact resize, verifies the compact mark and dark lockup, and exercises both primary destinations. Named keyboard-focusable regions contain wide tables and code.

The operations suite rejects secret-bearing flags and the Docker-only gateway hostname, verifies
the explicit host gateway passed to OneCLI, and proves that Pages uploads use native Wrangler.
The live CLI version probe was also checked against OneCLI 2.11.0 using its supported `version`
subcommand.

## Brand and theme review

- The favicon uses a simplified V-and-rising-graph mark on a dark substrate, without text or inaccessible metadata.
- The light and dark full lockups share the same outlined geometry and use dark graphite or off-white wordmarks respectively.
- All five production assets are self-contained path-based SVGs without live text, raster embeds, scripts, filters, animation, or external references.
- The header owns one accessible name while its logo image remains decorative; compact selection uses `<picture>` without duplicating meaningful content.
- Document theme, color scheme, semantic chart roles, and lockup source update from the same resolved theme state.

## Responsive, input, and state review

- Compact (320–639) uses one-column content, horizontal navigation, touch-sized controls, safe-area gutters, and a fixed viewport-bounded range panel.
- Medium (640–959) retains horizontal navigation and stacks dense charts and website details.
- Standard (960–1279) introduces the sidebar and split working layouts.
- Wide (1280+) increases comparison density while capping content at 1200 pixels.
- Responsive changes are CSS-only and preserve one semantic DOM order. There is no viewport-dependent React state or alternate mobile component tree.
- Reduced-motion rules remove non-essential animation; forced-colors rules preserve selected-state boundaries.

## Contrarian review and corrections

The review deliberately looked for ways the redesign could appear polished while still failing in practice. It found and corrected:

1. An API mock glob that also intercepted the application's source module; it is now origin-and-path scoped.
2. Recharts focusable SVG nodes inside `aria-hidden` containers; chart accessibility layers are disabled because exact values already have authoritative tables/lists.
3. Several light-theme metadata colors that narrowly missed AA contrast; tertiary and brand text roles were darkened.
4. A non-semantic `aria-label` on the workspace indicator and an over-broad dot selector that colored its label background.
5. A medium-width sidebar rule that contradicted the responsive contract; horizontal navigation now remains through 959 pixels.
6. A false overflow signal caused by comparing page width to the scrollbar-inclusive viewport; the test now compares document scroll and client widths.
7. The prior OneCLI probe used unsupported `--version` syntax; the guided doctor now uses the
   supported `onecli version` command and validates the private placeholder configuration rather
   than merely checking that a file exists.

## Human release checklist

Automated checks cannot certify subjective brand quality, screen-reader phrasing, or operating-system keyboard behavior. Before public release, the release owner should perform the quickstart's final checks for:

- favicon optics at native 16 and 32 pixels;
- light/dark appearance on the target operating systems;
- 200% browser zoom, touch rotation, and an on-screen keyboard;
- one complete keyboard-only pass;
- VoiceOver or NVDA announcement order;
- final visual approval of spacing, chart density, and wordmark geometry.

No known implementation blocker remains.
