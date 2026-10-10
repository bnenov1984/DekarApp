# 02 — Linked move (first user-visible slice)

Status: resolved
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

**2026-10-10 — resolved.** Implemented in `d58f607`. Deviations and findings:

- **Snap:** linked participants are excluded from snap targets entirely, rather than being kept as
  snap targets without the moving vertex. Removing one vertex from a polygon creates a phantom
  chord edge, which would be a worse snap target than none. The cost is that you can't snap the
  dragged point to a participant's *other* vertices, but doing that would collapse that
  participant's edge to zero length.
- **Locked neighbour in the UI:** `pointerDown` doesn't start a linked drag when a participant is
  locked (the same silent no-op as dragging a locked shape). Ctrl/⌘+drag still works on the unlocked
  shape alone.
- **Selection at outer corners:** verified that no change is needed. `findMeasurementAt` returns the
  topmost hit, and Split appends the parts after the parent, so a part wins (confirmed in the app:
  clicking inside the left half selected "Part 2", not the parcel).
- **Neighbour preview:** drawn as a dashed outline without handles (`drawLinkedVertexPreview`), since
  only the selected shape is editable.
- **Hands-on check** (Chrome via playwright-core, real mouse on the canvas): draw → Split → drag the
  shared top vertex moved both parts and left the parent unchanged; Ctrl+Z restored both in one
  step; Ctrl+drag moved only the selected part. Mid-drag frame showed both previews.
