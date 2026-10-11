# 02 — Left vertical tool bar

Status: ready-for-agent
Type: task
Blocked by: 01
Spec: ../spec.md · decision 5 · 15 W1 · 16 §3.1 ToolBar

## What

- `ToolDock.svelte` becomes a vertical bar docked to the left edge of the main row (~44px, full
  height between top bar and status bar), not floating over the canvas.
- Slots: Pan · Rectangle · Polygon · Circle · Freehand · Distance │ Split (X). Split starts the
  same flow as the X key / Properties Split; disabled without a selection or on a locked shape.
- Arrow keys ↑/↓ move focus; `aria-orientation="vertical"`. Tooltip = name + shortcut.

## Acceptance

Store test for the Split slot's enabled state if it needs new logic. Chrome: bar on the left,
canvas starts to its right, drawing with every tool still works, Split slot disabled with no
selection and starts a split with one.
