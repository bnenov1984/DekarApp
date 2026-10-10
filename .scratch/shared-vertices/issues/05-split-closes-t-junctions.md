# 05 — Split closes T-junctions

Status: ready-for-agent
Type: task
Blocked by: 02
Spec: ../spec.md · PD-024 §6, §9 · 18 §5

## What

- `src/application/sharedVertices.ts`: `closeTJunctions(surface, points, excludeIds)` — for each
  point lying on an edge interior (`pointOnSegmentInterior`) of a polygon/freehand shape not in
  `excludeIds` (the split measurement, its ancestors, its new children) and not already a vertex
  there, insert it (`addVertex` + `insertLabelAt`). Collinear, so the area is unchanged.
- Call it from `splitCommand` (the two boundary-hit endpoints of the dividing line) and
  `splitIntoPartsCommand` (endpoints of every internal boundary: child vertices shared by ≥2
  children that lie on the parent's boundary).
- **Locked neighbour: skip the insertion, don't refuse the Split** (decided during planning,
  2026-10-10 — it only affects linkability, never geometry). Recorded in 18 §5 by ticket 06.
- Update the "only ever reads the one parent … and appends" comments in `split.ts` and
  `splitIntoParts.ts` — no longer true.
- Existing projects: no repair of old T-junctions (PD-024 §9).

## Acceptance

Roundtrip: split A → B, C; split C with a line ending on the B|C boundary → B gains a collinear
vertex, B's area unchanged, A untouched; dragging that vertex then moves B and both of C's parts;
same via split-into-parts; locked B → the Split succeeds and B is unchanged; undo restores B.
Manual check in the running app.

## Comments
