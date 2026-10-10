# 04 — Linked vertex delete

Status: resolved
Type: task
Blocked by: 02
Spec: ../spec.md · PD-024 §7–8 · 18 §6.1

## What

- `src/application/commands/removeVertex.ts`: optional `linked?: boolean` (default `true`); remove
  the vertex from every participant; any `!result.ok` or locked participant → throw; labels via
  `removeLabelAt` per shape.
- `vertexEditSession.ts`: the Alt+click pre-check runs `removeVertex` on every participant (silent
  rejection if any fails, 18 §6); Ctrl/⌘+Alt+click = single shape.

## Acceptance

Roundtrip: removed from both; refused entirely when one participant would drop below 3 vertices or
self-intersect; locked refuses; labels shift per shape; undo restores both. Session test for the
pre-check.

## Comments

**2026-10-10 — resolved.** Implemented in `73cdbad`. Notes:

- The command checks all participants inside `do()` and throws on the first `!result.ok`
  (`TOO_FEW_VERTICES` / `WOULD_SELF_INTERSECT`) or, before that, on a locked neighbour. The
  session's Alt pre-check runs `removeVertex` on every participant and does nothing if any fails or
  a neighbour is locked, because `executeCommand` would let the throw escape into the canvas
  handler.
- Tests: roundtrip "delete: …" cases (both shapes, Split boundary keeps the parent's corner, labels,
  `linked: false`, too few vertices, self-intersection, locked); four session tests for Alt+click.
- **Hands-on check** (Chrome, real mouse): Alt+press with a small movement on the shared top
  boundary vertex removed it from both parts and the parent kept its corner; one Ctrl+Z restored
  both; Ctrl+Alt removed it from the selected part only.
- **Found, not changed (pre-existing bug):** an Alt+click that doesn't move the pointer deletes
  nothing. CanvasStage's `onMouseDown` only arms `pendingShapeDrag`, and `vertexPointerDown` (where
  the Alt deletion lives) runs only once the pointer crosses the drag threshold. Likely since
  `e58c816` (unified selection/drag). The `vertexEditSession` tests call `pointerDown` directly, so
  they don't catch it.
