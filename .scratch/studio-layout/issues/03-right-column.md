# 03 — Right column: Properties over Layers, always visible

Status: ready-for-agent
Type: task
Blocked by: 02
Spec: ../spec.md · decision 4 · 15 §2.2, W1, W2 · 16 §3.2 PanelShell

## What

- `MeasurementList` moves from the left into the right column under `PropertyPanel`; one
  280px column with a draggable divider between the two sections.
- Both sections always render: "Select a shape to see its properties." / "No shapes yet."
  The canvas no longer jumps when the first shape is drawn.
- Σ Total area stays at the bottom of the Layers section. Section headers share one style.

## Acceptance

Chrome: canvas bounding box identical before and after drawing the first shape; both sections
visible on an empty project; divider drag resizes them (position remembered for the session).
