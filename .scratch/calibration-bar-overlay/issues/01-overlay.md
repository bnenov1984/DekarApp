# 01 — Float the calibration bars over the canvas

Status: resolved
Type: task
Spec: ../spec.md

## What

- `Studio.svelte`: move `<ImportCalibrationBanner />` and `<CalibrationBar />` from flow children
  of `.shell` into a new `.calibration-overlay` div inside `.canvas-area`, `position: absolute;
  top: 0; left: 0; right: 0; z-index: 20` (same tier as `.right-overlay`).
- `CalibrationBar.svelte` / `ImportCalibrationBanner.svelte`: drop `flex: 0 0 40px` and
  `border-bottom`; add `border` (no top), `border-radius: 0 0 var(--af-radius-md)
  var(--af-radius-md)`, `box-shadow: var(--af-shadow-e2)`.

## Acceptance

Chrome 1440×900, bounding boxes: `.canvas-area`, the tool bar and the right column are pixel
identical before and after `startCalibration()`. The bar's rect matches `.canvas-area`'s left/
right exactly (doesn't cover the tool bar or the right column). Repeated at 1200×800 (compact
layout). Cancel still closes it; no new console errors.

## Comments

**2026-11-15 — resolved.** Implemented as described. Chrome 1440×900: before — canvas-area
44–1160×48–872 (w1116×h824), right column 1160–1440, tool dock 0–44. After `startCalibration()` —
all three rects identical; the bar rendered at 44–1160×48–88, exactly `.canvas-area`'s width, with
`.calibration-overlay` as its parent. Repeated at 1200×800: the bar matched `.canvas-area`'s
44–920 span. `Cancel` (clicked via its own `data-testid`, not a guessed coordinate) closed it and
reset the scale chip to "Not calibrated". Lint, tsc, svelte-check clean; 770 tests green. No new
console errors (only the pre-existing auth-fetch rejection with no backend running).
