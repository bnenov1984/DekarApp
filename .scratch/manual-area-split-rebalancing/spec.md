# Manual Area after Split — conserved-sum rebalancing (PD-021)

Status: ready-for-agent
Product Decision: PD-021 (docs/05_PRODUCT_DECISIONS.md, approved 2026-09-15)
Raised by: hands-on testing, 2026-09-15

## Problem Statement

A surveyor draws a parcel over an imported plan, types in its official real-world area (the
parcel's registered area — e.g. 1200 m² — which is authoritative even though the hand-drawn
polygon is only approximately accurate), then Splits it into parts.

Immediately after the Split the parts add up correctly. But the moment the surveyor drags a vertex
on one part to shape the division the way they actually want it, the parts stop adding up to the
parcel's official area. Each part's area drifts independently, and the sum lands on some number
that matches neither the parcel's registered area nor anything the surveyor entered.

This is wrong from the user's point of view: moving the boundary *between* two parts of a parcel
changes how the parcel is divided, not how big the parcel is. A parcel's registered area does not
change because a surveyor decided the dividing line should run somewhere else.

Today's behaviour is not a defect in the code — it is exactly what the current model specifies
(each Measurement independently carries a scale factor derived once, at the moment the manual area
was set, and Split children inherit that factor verbatim). The model itself is what needs to
change, which is why this work is gated behind a Product Decision.

## Solution

Parts produced by splitting a Measurement that carries a manual area now behave as a **division of
a fixed total** rather than as independent measurements that happen to share a starting scale.

The parts of a split form a group whose combined area is conserved. Reshaping any part
redistributes area between the parts — what one part loses, the others gain — so the group's areas
always add up to the parent's area. The surveyor can drag the dividing boundary freely to match
the real-world division, and the numbers stay consistent with the parcel's registered area
throughout, with no manual recalculation and no re-entering of the total.

Everything else stays as it is. Measurements without a manual area are unaffected. The parent
parcel keeps its own full undivided area (Split adds parts, it never replaces the parent — PD-009).
Undo and redo restore areas exactly. Nothing about calibration-derived areas changes.

## User Stories

1. As a surveyor, I want the parts of a split parcel to always add up to the official area I
   entered, so that my part areas stay consistent with the parcel's registered area.
2. As a surveyor, I want to drag a vertex on one part and see every part's area update at once, so
   that I can shape the division without recalculating anything by hand.
3. As a surveyor, I want the area one part loses to reappear in the other parts, so that moving a
   dividing boundary behaves like dividing a fixed parcel rather than resizing two unrelated shapes.
4. As a surveyor, I want this to hold for an N-way Split-into-parts, not only for a two-way Split,
   so that dividing a parcel into three or six parts is just as trustworthy.
5. As a surveyor, I want conservation to hold no matter how many successive edits I make, so that
   the numbers don't slowly drift over a long editing session.
6. As a surveyor, I want undo after a vertex edit to restore every part's area to exactly what it
   was, so that backing out of a change leaves no residue in the other parts.
7. As a surveyor, I want redo to put the rebalanced areas back exactly, so that undo/redo is
   symmetric for group edits just as it is for single-shape edits.
8. As a surveyor, I want inserting a vertex into a part to rebalance the group, so that adding
   detail to a boundary doesn't break the total.
9. As a surveyor, I want deleting a vertex from a part to rebalance the group, so that simplifying
   a boundary doesn't break the total either.
10. As a surveyor, I want moving a whole part without reshaping it to leave every area unchanged,
    so that repositioning never silently alters measurements.
11. As a surveyor, I want the parent parcel's own area to stay exactly as it was while I reshape
    its parts, so that the authoritative total I entered is never quietly rewritten by an edit to
    a part.
12. As a surveyor, if I do reshape the parent parcel itself, I want its parts to rebalance against
    the parent's new area, so that the parts still divide the parcel rather than the old one.
13. As a surveyor, I want to split a part again and have the sub-parts conserve that part's area,
    so that a multi-level division stays coherent at every level.
14. As a surveyor working on a parcel with no manual area set, I want nothing about my areas to
    change, so that ordinary calibration-derived measuring is untouched by this feature.
15. As a surveyor, I want a part I delete to not silently inflate the remaining parts, so that a
    missing part reads as a gap in coverage rather than as a bigger neighbour.
16. As a surveyor, I want the Σ Total shown for the Surface to stay correct while I reshape parts,
    so that the summary line never contradicts the individual rows.
17. As a surveyor, I want each part's area in the Layers list, the on-canvas chip, and the property
    panel to always agree with each other, so that no two places in the UI show different numbers
    for the same part.
18. As a surveyor, I want a locked part to keep refusing edits, so that locking still protects a
    finished part even inside a rebalancing group.
19. As a surveyor with no calibration set on the Surface at all, I want manual-area parts to still
    work, so that a parcel with a known registered area is measurable even when no scale can be
    established from the plan.
20. As a surveyor, I want a hidden part to still count toward the group's total, so that hiding a
    part for visual clarity doesn't change the arithmetic.
21. As a surveyor, I want the displayed part areas to add up to the entered total as shown (within
    display rounding), so that the numbers on screen survive being read out loud to a client.
22. As a surveyor who reopens a project saved before this change, I want its parts to start
    conserving the total from my next edit onward, so that existing work benefits without my
    having to re-enter anything.
23. As a developer, I want the Measurement Engine to remain a pure function of a single shape, its
    calibration and its unit, so that INV-2 is not weakened to buy this feature.
24. As a developer, I want group rebalancing to be undoable through the existing Command Stack with
    no new undo machinery, so that ADR-001 stays intact.
25. As a developer, I want the rebalancing rule to live in exactly one place, so that every command
    that reshapes a polygon gets it consistently and no future command can silently forget it.

## Implementation Decisions

**The group is derived, not stored.** No change to the Surface or Measurement schema. Split and
Split-into-parts already give every child a `parentId`, and PD-009 guarantees the parent Measurement
is never removed or replaced by a Split. A group is therefore exactly "the Measurements sharing a
`parentId`, where that parent carries a manual area" — derivable at any moment from data that
already exists. (PD-021's consequence list anticipated a new stored `SplitGroup` concept; the code
turned out not to need one. The INV-15 rewrite should describe the derived group.)

**The conserved total is the parent's own area.** The parent survives the Split holding its full
undivided polygon and its own manual-area factor, and its geometry does not change when a child is
edited — so the parent *is* the authoritative record of the total, with no separate copy to keep in
sync.

**Rebalancing assigns one shared factor to the whole group.** Distributing the total across members
in proportion to their geometric area is algebraically identical to giving every member the same
area-per-px² factor: `factor = parentArea / Σ(member geometric areas)`. This is worth noting because
at the moment of the Split — where the children's geometric areas sum to the parent's by
construction (INV-4/INV-14) — that formula yields precisely the parent's own factor. **PD-021 is
therefore a strict generalisation of today's behaviour: identical at split time, differing only
after a subsequent edit.** No migration, no behaviour change for anything that isn't edited.

**Rebalancing lives in one Application-layer helper.** A single pure helper takes a Surface and the
id of the Measurement that just changed, and returns a Surface with the affected group's factors
recomputed. This mirrors the existing shared vertex-labels helper (`src/application/vertexLabels.ts`),
which is invoked by the add-vertex and remove-vertex commands for exactly the same reason: a rule
that several commands must apply identically belongs in one module, not copied into each command.

**Which commands invoke it.** The polygon-geometry-mutating commands — edit vertex, add vertex,
remove vertex — call the helper on the Surface they produce, before returning it. The helper handles
both directions of the relationship: the changed Measurement may be a *member* of a group (rebalance
its siblings) or the *parent* of one (rebalance its children against the parent's new area). Rigid
translation preserves geometric area and therefore needs no rebalance; calling the helper there
would be harmless but is not required. Manual area remains polygon-only, so non-polygon resize
commands are out of the picture entirely.

**The Measurement Engine is not touched.** `compute(shape, calibration, unit)` stays a pure function
of exactly those three inputs (INV-2, 23 §2.2). Rebalancing is an explicit recompute-and-write-back
of stored factors at command time, not a cross-Measurement input to the engine. The display helper
that applies a manual-area factor also stays exactly as it is — it keeps reading one Measurement's
own factor and knows nothing about groups.

**Undo and redo need no new machinery.** Every command in this codebase already closes over the
whole `before` Surface and restores it wholesale (`undo: () => before`). A command that rebalances N
siblings inside its `do()` is therefore undone atomically for free, with no snapshot widening and no
change to the Command Stack or ADR-001. (PD-021's consequence about "widening the snapshot" was
written before this was confirmed; it describes an intent that the existing whole-aggregate command
shape already satisfies.)

**Nested splits fall out of the recursion.** Splitting a child creates a second group whose parent
is that child. Editing a sub-part rebalances within the sub-group; the sub-part's parent geometry is
unchanged by that edit, so the outer group needs no rebalance. Each level conserves its own total.

**Deleting a member does not rebalance.** The remaining parts keep their areas, so the group's sum
falls below the parent's total — correctly reading as "part of the parcel is no longer accounted
for" rather than silently inflating the survivors to cover a gap that exists in the geometry.

**Setting a manual area directly on a member** keeps today's behaviour (derives that member's own
factor from its own geometry). It is not treated as pinning; the next rebalance triggered in that
group will overwrite it. See Out of Scope.

**Degenerate guard.** If a group's member geometric areas sum to zero, skip the rebalance rather
than divide by zero — the same defensive convention the contain-fit and resize maths already use.

**Locking is unaffected.** The lock check already sits inside each command and refuses the edit
before any rebalance would run, so a locked part is never reshaped and never triggers redistribution.

## Testing Decisions

**A good test here asserts the conserved-sum property after a realistic sequence of commands** —
"set a manual area, split, then reshape a part, and the parts still add up to the entered total" —
not that a helper was called or that a particular factor has a particular internal value. The
invariant is the externally meaningful behaviour; the shared factor is an implementation detail that
a future change is free to replace.

**Primary seam: the Application command layer against a real Surface and Command Stack.** This is
the existing seam that `src/application/commands/roundtrip.test.ts` already uses, and it is where
`docs/22_TDD.md`'s matrix already anchors **T-INV-15** ("Integration — SetManualArea,
SplitIntoParts — inherits manualArea"). Extending that existing row is strongly preferred to
introducing a new seam. It is also the highest seam that can actually reach this bug: the behaviour
is a multi-command, multi-Measurement sequence, so a seam any lower (a single command, or the core
split algorithm) cannot express it.

**Assert the sum from geometric area × stored factor, inside the Application layer.** Do not reach
into the UI display helper to compute "displayed area" — that would cross a layer boundary the
eslint boundaries rule enforces, and the invariant is a domain/application property, not a rendering
one. The arithmetic is the same either way.

**Cases to cover at that seam:** two-way Split and N-way Split-into-parts; a vertex edit, a vertex
insertion and a vertex deletion on a member; several successive edits (no cumulative drift); undo
and redo restoring every member's area exactly; an edit to the parent rebalancing its children; a
nested split conserving at both levels; a member deletion *not* inflating the survivors; and a
parcel with no manual area behaving exactly as before.

**Unit-test the rebalance helper directly too**, mirroring `src/application/vertexLabels.test.ts` —
the prior art for a pure Application-layer helper with its own focused test alongside the
integration coverage.

**A property-based test is the natural fit for the core claim** ("for any split and any sequence of
vertex drags, the group sums to the total"), matching how INV-4 and INV-14 are already covered
property-based per the TDD matrix.

**The TDD matrix row for INV-15 must be updated** in the same work, since PD-021 rewrites what
INV-15 asserts. Per `docs/22_TDD.md`'s own rule, an invariant change without its matrix row updated
is incomplete.

## Out of Scope

- **Pinning an individual part's area.** Letting a surveyor fix one part at a known official figure
  and have the remaining parts distribute the remainder is a genuinely useful follow-up, but it is a
  separate capability with its own UI affordance and its own product decision. Not in this work.
- **Rebalancing when a member is deleted** (decided against above; noted for the PO in Further Notes).
- **Any UI affordance for drift** — a warning badge or a manual "rebalance now" button was the
  rejected alternative (Option B) when PD-021 was decided. Rebalancing is automatic and silent.
- **Manual area on non-polygon shapes.** Unchanged: manual area remains polygon-only.
- **INV-4 and INV-14 themselves.** They remain split-commit-time geometric invariants and are not
  restated as ongoing constraints.
- **A persistence migration.** Existing saved Surfaces keep their stored factors and are already
  correct as-of their last edit; the first geometry edit after this ships rebalances them. No
  migration step, no version bump.
- **Changing how the total is entered.** The manual-area input, its validation and its clearing
  behaviour are all untouched.

## Further Notes

- **PD-021 versus what the code turned out to allow.** The PD's consequences list named a new stored
  `SplitGroup` concept and a widening of command snapshots. Implementation investigation showed
  neither is needed: `parentId` plus a surviving parent already encode the group, and commands
  already snapshot the whole Surface. The PD's *decision* (conserved sum) is unaffected; the
  14_DOMAIN_MODEL INV-15 rewrite should describe the derived group rather than a stored one, and
  should not claim an ADR-001 change that isn't happening.
- **Deletion is the one place a reasonable person could want the opposite rule.** If the PO decides
  that deleting a part should redistribute its area across the survivors (treating the parcel as
  always fully divided among whatever parts exist), that is a one-line change to the trigger set —
  but it is a product judgement, not an implementation detail, so it is recorded here rather than
  decided by the implementer.
- **Rounding.** The conserved sum is exact in the stored factors; what the surveyor sees is subject
  to the existing display rounding, so the visible parts may sum to the entered total ±1 display
  unit. This is existing display behaviour, not something this work introduces, but it is worth
  knowing before writing an assertion against displayed strings.
- **Why this wasn't caught earlier.** No test covered the combination "manual area → split → edit a
  child". The individual pieces were each well covered in isolation, which is exactly why the gap
  survived — worth remembering when choosing the test cases above.
