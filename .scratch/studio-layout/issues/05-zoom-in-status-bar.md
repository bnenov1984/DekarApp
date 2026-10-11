# 05 — Zoom percentage in the status bar

Status: resolved
Type: task
Blocked by: 01
Spec: ../spec.md · decision 7 · 15 §2.2 status bar

## What

The floating `zoom-indicator` in `CanvasStage.svelte` moves into `StatusBar.svelte`, after snap
and units; whatever it does on click today keeps working.

## Acceptance

Chrome: nothing floats over the canvas but shapes; the status bar shows the zoom and updates on
wheel zoom.

## Comments

- 2026-10-11 — Done in `a485cac`. The zoom % is a status-bar button after snap and units (order:
  scale chip, snap, units, zoom, …, ?). Click asks for a reset through a new
  `zoomResetRequested` signal (viewportSession.ts, test-first, 2 new tests) and CanvasStage
  resets around the canvas center; double-click bumps the existing fit-to-content signal.
- **Chrome check** (1400×900): no zoom button over the canvas; wheel zoom 100% → 246% shown in
  the status bar; click → 100%; zoomed out to 64% then resized the window → still 64% (the reset
  doesn't re-fire on resize); double-click → fit (245%). Tests 728 green, typecheck/svelte-check/
  lint clean.
- Found while checking, not changed (pre-existing): the mouse wheel over a shape's on-canvas
  label chip doesn't zoom, because the chip is an HTML element above the canvas and the wheel
  listener is on the canvas.
