# Contract: Geography Display

## Naming

1. Every place a country appears (tables, map tooltips, accessible names, summaries) shows the full
   English name from the generated reference data. The code may appear as secondary text.
2. `T1` displays "Tor network"; `XX`, `Unknown`, and empty display "Unknown location". Raw `T1`
   and `XX` never appear as a label.
3. An unrecognized value displays `<value> (unrecognized)` as plain text (never interpreted as
   markup) and the view still renders.

## Geography view

1. **Map**: world map shaded by share of page views using a single-hue sequential scale with a
   legend showing the minimum and maximum. Countries with no traffic use a distinct neutral fill
   with an outline, so zero is visibly different from a low value.
2. **Table**: every location with traffic (all rows received), columns Location, Page views,
   Share; sortable by Location and by Page views; keyboard operable; is the accessible equivalent of
   the map.
3. **Continent totals**: one row per continent with page views, share, and number of countries;
   plus an "Unlocated" row for Tor and unknown so totals sum to the range total.
4. **Hover and focus**: a country shape shows a tooltip and is focusable when it has traffic; the
   same details are available in the table. No information is conveyed by color alone.
5. **Empty and single-value states**: no traffic shows an explanatory empty state; one country shows
   the map with that country highlighted and the table.
6. **Network**: rendering makes no request to any origin other than the local console.
7. **Scope and range**: uses the shell scope and range; loading shows placeholders and never
   stale values.
