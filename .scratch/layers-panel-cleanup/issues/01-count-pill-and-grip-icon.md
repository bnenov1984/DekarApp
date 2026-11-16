# 01 — Count pill and grip icon

Status: resolved
Type: task
Spec: ../spec.md

## What

- `Icon.svelte`: add `'grip'` — six filled `currentColor` circles, 24×24 viewBox, matching the
  existing shared icon set's conventions (the other icons are stroke-only; this one overrides
  to filled locally since a stroked ~1.3px dot renders as a ring, not a dot).
- `MeasurementList.svelte`:
  - Header: `<span>Layers</span>` + a conditional `<span class="count">` pill (pill shape,
    `--af-surface-app` background, `--af-ink-secondary` text, tabular numerals).
  - Row: swap the `⠿` glyph span for `<Icon name="grip" size={14} />`; `.drag-handle` is
    `opacity: 0` at rest, `opacity: 1` on `.row:hover` or `.row.dragging`.

## Acceptance

Chrome 1440×900, two drawn shapes: header reads "Layers" + a "2" pill (not a superscript);
`getComputedStyle` on the pill shows `border-radius: 999px` and secondary-ink text; the grip
icon is a real `<svg>` (not a text glyph), `opacity: 0` on an unhovered row and `1` on a
real-mouse hover. Lint, tsc, svelte-check clean; existing suite green (no component-test
harness exists for Svelte files, per the studio-layout spec's own testing note).

## Comments

**2026-11-16 — resolved.** Implemented as described. Drawing required `Enter` (not `Return`) to
close the polygon via the `computer` tool's key names — unrelated to this fix, noted for future
Chrome checks in this repo. Verified: empty project shows "Layers" with no pill; after two
polygons, the pill shows "2" with `background: rgb(27,29,33)` (`--af-surface-app`, dark theme),
`border-radius: 999px`; the grip `<svg viewBox="0 0 24 24">` is present with `opacity: 0` at
rest and `opacity: 1` once the row genuinely received a hovered mouse position (a CDP-level
hover, not a dispatched `mouseenter`, which doesn't set real `:hover`). Lint, tsc, svelte-check
clean; 770 tests green.
