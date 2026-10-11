# 01 — Wheel step and zoom over labels

Status: resolved
Type: task
Spec: ../spec.md · decisions 1, 2

## What

- `viewport.ts`: a wheel event with |deltaY| ≥ 50px, or deltaMode line/page, zooms exactly ×1.1
  (in for negative deltaY). Smaller pixel deltas zoom 1.1^(|deltaY|/50) — proportional, capped
  below one step. Constants in DEFAULT_VIEWPORT_CONFIG.
- CanvasStage: the wheel listener moves from the `<canvas>` to the canvas-stage container, so
  labels and overlays don't block it.

## Acceptance

Unit tests first (any notch size → ×1.1; small deltas proportional and < one step; line mode =
notch; limits still hold). Chrome: one notch 100 → 110%; the wheel zooms over a label.

## Comments

- 2026-10-11 — Done in `afb8673`. `wheelZoomFactor(deltaY, deltaMode)` in viewport.ts (6 new
  tests, written first); `zoomStep: 1.1`, `wheelNotchPixels: 50` in DEFAULT_VIEWPORT_CONFIG;
  the listener is on the canvas-stage container.
- **Chrome check** (1400×900): one notch of deltaY −100 and −400 → 110%; +120 and +400 → 91%;
  7 notches in → 195%; ten 5px trackpad-like events → 110%; wheel with the pointer on a label's
  text → 110%, page not scrolled. Tests 747 green, typecheck/svelte-check/lint clean.
- Note: a macOS mouse that reports small pixel deltas per notch would zoom proportionally (more
  gently) — not checked, no Mac here.
