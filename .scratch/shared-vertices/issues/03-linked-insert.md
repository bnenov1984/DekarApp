# 03 — Linked vertex insert on a shared edge

Status: resolved
Type: task
Blocked by: 02
Spec: ../spec.md · PD-024 §7 · 18 §6.1

## What

- `src/application/commands/addVertex.ts`: optional `linked?: boolean` (default `true`); shared
  edges via `findSharedEdges`; insert the same point into each (labels via `insertLabelAt` per
  shape, INV-17); all-or-nothing (locked or invalid participant → throw); rebalance each.
- `vertexEditSession.ts`: edge drag previews every shape sharing the edge; Ctrl/⌘ = single shape.

## Acceptance

Roundtrip: insert on a Split boundary → both shapes gain the vertex at the right index, labels
shifted in both; curve neighbour untouched; locked neighbour refuses; undo restores both; a
following drag of the new vertex moves both shapes. Session test for the multi-shape preview.

## Comments

**2026-10-10 — resolved.** Implemented in `554e699`. Notes:

- Same rules as the linked move (02): a locked neighbour blocks the linked edge drag in the UI
  (Ctrl/⌘ still inserts into the unlocked shape alone), and neighbours are excluded from snap for the
  duration of the drag. Their committed edge lies on the same line as the source's own edge, which
  is already excluded.
- The neighbour's preview reuses `drawLinkedVertexPreview` (dashed outline, no handles).
- Tests: roundtrip "insert: …" cases in the PD-024 describe (renamed "PD-024 — shared vertices"),
  including the shared edge being the neighbour's closing edge in the opposite direction and labels
  shifting in both shapes; four session tests for the edge drag.
- **Hands-on check** (Chrome, real mouse): Split → drag the shared boundary edge → both parts gained
  the vertex and the parent was unchanged; dragging that new vertex moved both parts; two Ctrl+Z
  restored both; Ctrl+drag on the edge inserted into the selected part only.
- **Found, not changed (pre-existing):** the parent's area label sits at its centroid, which for a
  two-way split lies on the shared boundary. A press there grabs the parent's label instead of the
  edge, so you can't start an edge insert right at the middle of that boundary.
