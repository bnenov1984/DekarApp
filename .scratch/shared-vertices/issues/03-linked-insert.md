# 03 — Linked vertex insert on a shared edge

Status: ready-for-agent
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
