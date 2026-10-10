# 01 — Link finder

Status: resolved
Type: task
Blocked by: —
Spec: ../spec.md · PD-024 · INV-19 · 18 §6.1

## What

Pure helpers that answer "which other vertices/edges are linked to this one". No user-visible
change.

- Core `src/core/drawing/coincidence.ts`: `COINCIDENCE_EPSILON` (≈1e-6 Surface units, zoom-
  independent — never the 8px snap tolerance), `pointsCoincide(a, b)`,
  `pointOnSegmentInterior(p, a, b)`.
- Application `src/application/sharedVertices.ts` (beside `splitGroup.ts` — needs `parentId`):
  - `isAncestorOrDescendant(surface, a, b)` — transitive `parentId` walk.
  - `findLinkedVertices(surface, measurementId, vertexIndex)` → `{ measurementId, vertexIndex }[]`.
    Polygon/curve/freehand only; excludes self and any ancestor/descendant; includes hidden and
    locked participants (the commands decide what locked means).
  - `findSharedEdges(surface, measurementId, edgeIndex)` → `{ measurementId, edgeIndex }[]` — both
    endpoints linked to adjacent vertices (either direction) of another polygon/freehand shape.
    Curves excluded (PO, 2026-10-10).

## Acceptance

Table-driven unit tests (mirror `src/core/drawing/hitTest.test.ts`):
- exact match; epsilon just inside / just outside; near-but-not-coincident stays independent;
- sibling, cousin and manually snapped neighbour are linked;
- parent ↔ child and grandparent ↔ grandchild (nested split) are not;
- rectangle, circle, line ignored;
- after `dissolveSplitGroup`, survivors **do** link to the former parent (PO, 2026-10-10);
- shared-edge detection in both winding directions; curve edge not reported.

`npm test`, `npm run typecheck`, `npm run lint` green (boundaries: `sharedVertices.ts` imports only
Core + `surfaceOps.ts`).

## Comments

**2026-10-10 — resolved.** Implemented in `d912e0a`: `src/core/drawing/coincidence.ts` (epsilon, `pointsCoincide`, `pointOnSegmentInterior`) and `src/application/sharedVertices.ts` (`isAncestorOrDescendant`, `findLinkedVertices`, `findSharedEdges`), with table-driven tests beside each. `editablePoints`/`isClosedEditable` are now exported from `hitTest.ts` instead of being copied a third time.
