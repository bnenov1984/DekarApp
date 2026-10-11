# 05 — Zoom percentage in the status bar

Status: ready-for-agent
Type: task
Blocked by: 01
Spec: ../spec.md · decision 7 · 15 §2.2 status bar

## What

The floating `zoom-indicator` in `CanvasStage.svelte` moves into `StatusBar.svelte`, after snap
and units; whatever it does on click today keeps working.

## Acceptance

Chrome: nothing floats over the canvas but shapes; the status bar shows the zoom and updates on
wheel zoom.
