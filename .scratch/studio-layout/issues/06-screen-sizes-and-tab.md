# 06 — Screen sizes and the Tab shortcut

Status: ready-for-agent
Type: task
Blocked by: 03, 04, 05
Spec: ../spec.md · decision 8 · 15 §11

## What

- 1024–1279px: right column collapses to an edge strip; clicking it opens the column as an
  overlay over the canvas (canvas doesn't shrink).
- <1024px: view-only per PD-022 — no tool bar, no editing gestures, right column as overlay,
  top bar shows title + Export.
- Tab (when focus isn't in a text field) hides/shows both side columns at any width. Store test
  first for the toggle.

## Acceptance

Store tests for the Tab toggle. Chrome at 1400, 1200 and 900 px wide: layout per §11, no
overlaps, no horizontal page scroll.
