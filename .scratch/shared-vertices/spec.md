# Shared vertices — topological editing of coincident points (PD-024)

Status: ready-for-agent
Product Decision: PD-024 (docs/05_PRODUCT_DECISIONS.md, approved 2026-10-10)
Invariant: INV-19 (docs/14_DOMAIN_MODEL.md §4), test row T-INV-19 (docs/22_TDD.md §3)
Engine spec: docs/18_DRAWING_ENGINE.md §5 (T-junctions), §6.1 (topological editing)
Raised by: hands-on testing, 2026-10-10

## Problem Statement

A surveyor splits a parcel into two parts. Along the dividing boundary, each part has its own copy
of every point — two vertices stacked exactly on top of each other — and at the outer corners the
surviving parent (still visible on the canvas, PD-009) adds a third. Grabbing the vertex you
actually want is fiddly, and once you do, dragging it moves only that one part: the neighbouring
part stays where it was, and a gap or an overlap opens along what should be a single shared
boundary.

The same happens with manually drawn neighbours that were snapped vertex-to-vertex. PD-009 requires
the manual path to be structurally equivalent to Split, so whatever fixes this for Split parts must
fix it for snapped neighbours too.

## Solution

Coincident vertices move together. When the surveyor drags, inserts or deletes a vertex, every
other shape on the same Surface that has a vertex at **exactly** the same coordinates is edited the
same way, in the same command, with one undo. The parent of a split and its parts are never linked
to each other — the parts are joined to one another, not to the original parcel. Holding `Ctrl`
(`⌘` on macOS) while dragging moves only the selected shape's vertex.

When a new Split's dividing line ends in the middle of a neighbour's edge (a T-junction), Split
also inserts a vertex into that neighbour at the same point, so the junction becomes a shared
vertex instead of a place where the boundary silently tears on the next edit.

Nothing about the data model changes: shapes stay independent value objects (INV-1), the link is
derived from coordinates at edit time, nothing new is persisted, no migration.

## User Stories

1. As a surveyor, I want dragging a vertex on the boundary between two split parts to move both
   parts, so that the shared boundary never opens a gap or overlap.
2. As a surveyor, I want the same behaviour for neighbours I drew by hand and snapped vertex-to-
   vertex, so that manual drawing is as good as Split (PD-009).
3. As a surveyor, I want the parent parcel to stay exactly as it is when I reshape its parts, so
   that the registered parcel and its conserved area (PD-021) are untouched by how I divide it.
4. As a surveyor, I want editing the parent's own vertices not to drag its parts along, so that the
   two levels stay independent in both directions.
5. As a surveyor, I want `Ctrl`/`⌘`+drag to move only the selected shape's vertex, so that I can
   deliberately pull one part away from its neighbour.
6. As a surveyor, I want inserting a vertex on a shared edge to insert it in every shape sharing
   that edge, so that I don't create a new T-junction by adding detail.
7. As a surveyor, I want deleting a shared vertex to delete it from every shape that has it, and to
   be refused as a whole if any of them would become invalid, so that I never end up with half a
   deletion.
8. As a surveyor, I want a locked neighbour to block the whole move, so that a shape I locked is
   never reshaped as a side effect.
9. As a surveyor, I want a hidden neighbour to follow, so that hiding a part doesn't make it
   silently overlap its neighbours (its area still counts in Σ Total).
10. As a surveyor, I want one undo to restore every shape a linked edit touched, so that backing out
    is as simple as for a single-shape edit.
11. As a surveyor, I want a repeated Split whose line ends on a neighbouring part's edge to turn that
    point into a shared vertex, so that "all neighbouring points are common" holds after any number
    of Splits.
12. As a surveyor, I want my existing projects to get this behaviour without any conversion, so that
    split and snapped boundaries I already have just start moving together.
13. As a surveyor, I want points that merely look close (but were not snapped or split) to stay
    independent, so that zoom level never decides whether two shapes are glued.

## Implementation Decisions

**The link is derived, never stored.** A pure Core helper takes a Surface (or its shapes), a source
measurement id and a vertex index, and returns the set of `(measurementId, vertexIndex)` pairs at
exactly the same coordinates. Same shape as PD-021's derived group (`src/application/splitGroup.ts`)
— no schema change, no persistence change, nothing for the future `.areaflow` file format to know.

**"Exactly the same" means a floating-point epsilon, not the snap tolerance.** Split and vertex snap
already write identical coordinates; the epsilon only absorbs arithmetic noise (Split intersection
points). It is a fixed Surface-space constant, independent of zoom — the 8px screen-space snap
tolerance (18 §4) must not be reused here.

**Ancestor/descendant exclusion is by `parentId` chain, transitively.** A measurement is never
linked to any of its ancestors or descendants (parent, grandparent after a nested split, …).
Siblings, cousins and unrelated neighbours all link.

**Participating shapes: vertex-list shapes only.** Polygon, curve and freehand — the same set
`vertexEditSession.ts` already edits by vertex index. Rectangles, circles and lines neither drive
nor follow a linked edit (a rectangle corner can't move alone and stay a rectangle). See Further
Notes — PO-confirmed 2026-10-10.

**Commands gain a linked variant, not a new command type.** `editVertexCommand`,
`addVertexCommand` and `removeVertexCommand` (src/application/commands/) apply the edit to the
source shape *and* every linked participant inside one `do()`, then run PD-021's
`rebalanceSplitGroups` for every touched measurement. Because every command already closes over
the whole `before` Surface (`undo: () => before`), undo/redo is atomic for free — no ADR-001 change.
A `linked: boolean` (or equivalent) parameter carries the `Ctrl`/`⌘` detach choice; `false` keeps
today's single-shape behaviour exactly.

**All-or-nothing validation.** If any participant is locked (INV-13), the command throws before
mutating anything — same path as today's lock refusal. If the edit would make any participant
invalid (self-intersection, < 3 vertices), the whole command is rejected; for drag this means the
preview freezes at the last valid position (existing behaviour), for Alt+click delete it means
silent rejection (18 §6).

**Inserting on a shared edge.** An edge is shared when both its endpoints are linked to the two
endpoints of an edge in another shape (adjacent indices, either direction). The new vertex is
inserted into that edge in every such shape. `vertexLabels` shift per shape (INV-17) using the
existing `src/application/vertexLabels.ts` helper.

**Split closes T-junctions.** After computing the children, `splitCommand` / `splitIntoPartsCommand`
check each endpoint of the dividing line(s) against the edges of every other non-ancestor shape on
the Surface (polygon/curve/freehand); where an endpoint lies on an edge interior (within the same
epsilon) and is not already a vertex there, a collinear vertex is inserted into that shape. Area is
unchanged; still one command, one undo. The existing comment in `split.ts` ("this command only
ever reads the one parent … and appends") must be updated — that guarantee no longer holds.

**UI: live preview of every participant.** `vertexEditSession.ts` today previews only the dragged
measurement (`previewShape`). The drag state must carry preview shapes for all linked participants,
computed at `pointerDown` (link set fixed for the duration of the drag) and updated on every
`pointerMove`. Snap during the drag must ignore the participants' own coincident vertices, or the
dragged point would snap to itself.

**Detach modifier.** `PointerModifiers` in `vertexEditSession.ts` gains `ctrlKey`/`metaKey`; the
Canvas passes them through. `Ctrl` on Windows/Linux, `⌘` on macOS. `Alt` keeps both its current
meanings (snap off during drag, Alt+click deletes a vertex).

**Which vertex is grabbed.** Vertex editing already happens only on the *selected* measurement
(`pointerDown(point, modifiers, measurementId)`), so the selected shape always wins and the source
of the edit is unambiguous. With a parent and a part both selectable at an outer corner, canvas
selection should prefer the deeper descendant (PD-024 §4) — check the current canvas
selection hit-test and change it only if it doesn't already.

**Rebalance after a linked edit.** Each touched measurement may belong to a different Split group;
call `rebalanceSplitGroups` once per touched measurement (it is a no-op outside a group). Assert the
PD-021 sum after linked edits in tests.

## Testing Decisions

**Primary seam: the Application command layer against a real Surface and Command Stack**
(`src/application/commands/roundtrip.test.ts`), which is where T-INV-19 is anchored in
docs/22_TDD.md. Tests assert outcomes — every participant's vertex is where it should be, the parent
is untouched, undo restores the whole Surface — not that a helper was called.

**Unit-test the Core link-finding helper directly,** table-driven, mirroring
`src/core/drawing/hitTest.test.ts`: exact match, epsilon boundary (just inside / just outside),
near-but-not-coincident points stay independent, ancestor/descendant exclusion including a nested
split, non-vertex shapes ignored.

**Cases at the command seam:**
- two-way Split: drag a shared boundary vertex → both parts move, parent unchanged;
- manually drawn neighbours snapped vertex-to-vertex → move together;
- parent vertex edit → parts unchanged;
- `linked: false` (Ctrl/⌘ detach) → only the source moves;
- insert on a shared edge → inserted in both shapes, labels shifted in both;
- delete a shared vertex → removed from both; refused entirely when one participant would drop
  below 3 vertices or self-intersect;
- locked neighbour → command refused, Surface unchanged;
- hidden neighbour → follows;
- repeated Split whose line ends on a sibling's edge → sibling gains a collinear vertex, area
  unchanged, and a subsequent drag moves all three shapes;
- N-way Split-into-parts → interior junctions are linked;
- undo/redo after each of the above restores/re-applies the whole Surface;
- PD-021: manual area → Split → linked drag → both groups still sum to their totals.

**Property-based** (fast-check, as for INV-4/INV-14): for a random simple polygon split by a random
valid line and a random drag of a random shared vertex, the two children still share every
boundary vertex and their geometric areas still sum to a single polygon's area with no overlap.

**UI session tests** in `src/ui/stores/vertexEditSession.test.ts`: the preview contains every
participant; Ctrl/⌘ produces a single-shape preview; snap does not lock onto the participants' own
vertices.

**Update the T-INV-19 row** in docs/22_TDD.md from "предстои" to the real test names once written
(Documentation Synchronization rule, CONTRIBUTING.md).

## Out of Scope

- **A stored topology** (shared vertex entities, a planar graph). Rejected in PD-024 §1.
- **Edge snap inserting a vertex into the other shape** during manual drawing — 18 §4 unchanged.
  Manual T-junctions stay T-junctions.
- **Repairing T-junctions in existing projects.** Only new Splits close them (PD-024 §9).
- **A StatusBar toggle** for topological editing — the modifier is enough for now (PD-024 §5).
- **Linking across Surfaces.**
- **Rectangle, circle and line shapes** as participants (see Further Notes).
- **Translating a whole measurement** (move drag): rigid moves are not vertex edits and don't drag
  neighbours along.

## Further Notes

- **Which shape types participate (PO-confirmed 2026-10-10).** The spec restricts linking to
  polygon/curve/freehand, because rectangles and circles aren't edited by vertex and a rectangle
  can't follow a single corner and remain a rectangle. Line (distance) endpoints are excluded too.
  If the PO wants line endpoints to follow (e.g. a distance measured along a parcel boundary), that
  is an additive follow-up.
- **Curves.** Curve vertices are control points; linking a curve's control point to a polygon
  vertex makes both pass through that point, but the curve's boundary between points is not the
  polygon's straight edge — so "shared edge" for vertex insertion only applies when both shapes
  treat the edge the same way. Simplest correct rule: shared-edge insertion only between
  polygon/freehand edges; curves participate in move/delete only. Confirm during implementation.
- **Selection preference at outer corners.** If canvas selection currently picks the parent over
  the part when clicking an outer corner, changing it is in scope (PD-024 §4); if it already picks
  the part or the topmost-drawn shape, document what it does.
- **Floating-point epsilon.** Choose it relative to Surface coordinates (e.g. 1e-6 px) and cover the
  boundary in the Core unit test. Split's intersection arithmetic is the only source of
  non-identical coordinates for "the same" point; verify its output is bit-identical between the
  two children first — if it is, the epsilon is only a safety margin.

## Comments

**2026-10-10 — PO confirmed** the three Further Notes points that weren't covered in the grilling:
(1) only polygon/curve/freehand take part (rectangles, circles and lines are excluded); (2) curves
take part in move and delete only, and shared-edge insertion applies only between polygon and
freehand edges; (3) at outer corners, selection prefers the part over the parent.
