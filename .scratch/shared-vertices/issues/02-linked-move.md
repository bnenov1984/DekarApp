# 02 — Linked move (first user-visible slice)

Status: ready-for-agent
Type: task
Blocked by: 01
Spec: ../spec.md · PD-024 §1–5, §8 · INV-19 · 18 §6.1

## What

- `src/application/commands/editVertex.ts`: optional `linked?: boolean` (default `true`). In
  `do()`: participants via `findLinkedVertices`; any locked participant → throw (same message style
  as the command's own lock check); `editVertex` on each — any throw aborts the whole command;
  `rebalanceSplitGroups` once per touched id. `linked: false` = today's exact behaviour.
- `src/ui/stores/vertexEditSession.ts`: `PointerModifiers` gains `ctrlKey`/`metaKey`; on a vertex
  `pointerDown`, fix the participant set for the whole drag (empty when Ctrl/⌘ held); `VertexDrag`
  carries `linkedPreviews`; `pointerMove` recomputes all previews and freezes if any is invalid;
  snap must not capture the moving point on its own participants (use the participants' preview
  shapes without the moving vertex as snap targets, so their other vertices stay snappable);
  `pointerUp` passes `linked`.
- `src/ui/components/CanvasStage.svelte`: add `ctrlKey`/`metaKey` to every modifier object; draw
  the linked previews (extend the `drawVertexEditPreview` call, `src/ui/rendering/sceneRenderer.ts`).
- Verify (don't change unless wrong) that canvas selection prefers a part over its parent at an
  outer corner (`findMeasurementAt` in `studioSession.ts` — topmost hit; children are appended
  after the parent).

## Acceptance

`roundtrip.test.ts`, new describe "PD-024 — linked vertex move": siblings move together, parent
untouched; manually snapped neighbours move; `linked: false` moves one; locked neighbour refuses
and the Surface is unchanged; hidden neighbour follows; self-intersection in any participant
rejects all; undo/redo atomic; PD-021 sums hold after a linked drag; nested split.

`vertexEditSession.test.ts`: preview contains all participants; Ctrl/⌘ gives a single-shape
preview; snap is not captured by participants.

fast-check: random simple polygon + random valid split line + random drag of a shared vertex →
the children still share the boundary and the sum of their geometric areas equals the area of
their combined outline.

Manual check in the running app (plan Verification section).

## Comments
