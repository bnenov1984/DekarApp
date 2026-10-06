# Documentation Index — Task Router

This is a **router, not a summary**. Each entry tells you which document actually governs a task
and why — it does not restate that document's content. See [../CLAUDE.md](../CLAUDE.md) for the
authority tiers and conflict rules this index assumes.

**How to use it:** find the category closest to your task, read its *Authoritative* doc(s) for
the relevant section, and check *Consult if relevant* before assuming a clean slate. *Supporting*
docs explain rationale — read them only if the authoritative doc references an open question or
you need to justify a judgment call.

---

## 1. Product scope & intent — "are we even allowed to build this?"

**Use when:** a task adds/removes a capability, changes what v1 covers, or you're unsure whether
something is an already-settled decision, an explicitly parked idea, or genuinely undecided.

- **Authoritative:** [PRODUCT_BIBLE.md](PRODUCT_BIBLE.md) (frozen concept/principles/guardrails),
  [05_PRODUCT_DECISIONS.md](05_PRODUCT_DECISIONS.md) (PD-001…023 — the living, append-only "what"
  log; check here first for whether your task is already decided, PARKED, or open).
- **Supporting:** [08_PERSONAS.md](08_PERSONAS.md), [09_USER_JOURNEYS.md](09_USER_JOURNEYS.md),
  [10_USER_STORIES.md](10_USER_STORIES.md) — who the decision serves and why, for tie-breaking
  between competing designs (08's own priority rule, revised by PD-022: P2 wins unless P1 is
  harmed — simplicity stays the method).
- **Consult if relevant:** [07_COMPETITIVE_ANALYSIS.md](07_COMPETITIVE_ANALYSIS.md) — pattern
  precedent (P1–P16) when a UX choice needs justification against how other tools solved it.

## 2. Domain model & data rules — Surface / Layer / Measurement / invariants

**Use when:** a task touches the shape of persisted data, an INV-# invariant, aggregate
boundaries, or domain events.

- **Authoritative:** [14_DOMAIN_MODEL.md](14_DOMAIN_MODEL.md) — bounded contexts, aggregates
  (Surface is root, not Project), entities vs. value objects, INV-1…18, domain event vocabulary.
- **Supporting:** [11_INFORMATION_ARCHITECTURE.md](11_INFORMATION_ARCHITECTURE.md) — the
  pre-domain object structure 14 was translated from; useful when a domain question is really an
  IA question in disguise.
- **Consult if relevant:** [22_TDD.md](22_TDD.md) §3 — every INV has exactly one traceable test
  row; a domain change without a corresponding test-matrix update is incomplete.

## 3. Measurement & calibration behavior — area/perimeter/units/scale

**Use when:** fixing or changing how area, perimeter, distance, angles, or unit conversion are
computed, or how a Surface gets/loses a scale.

- **Authoritative:** [17_MEASUREMENT_ENGINE.md](17_MEASUREMENT_ENGINE.md) (the
  `compute(shape, calibration, unit)` contract and its guardrails — it must stay a pure function
  of exactly those three inputs), [19_IMPORT_EXPORT.md](19_IMPORT_EXPORT.md) §3 (CalibrationService
  — where scale establishment logic lives).
- **Supporting:** [14_DOMAIN_MODEL.md](14_DOMAIN_MODEL.md) §4 (INV-2 purity, INV-3 atomic
  recalibration, INV-4 Split-sum), [23_API.md](23_API.md) §2.2 (exact signature).
- **Consult if relevant:** [22_TDD.md](22_TDD.md) §5.1 (geo/Mercator golden anchor — do not weaken
  without an explicit PD-equivalent); `27_NOTES/PHASE_4_IMPLEMENTATION_ISSUES.md` ISS-003
  (confidence/precision calibration is engineering-tunable, not hardcoded).

## 4. Drawing & geometry — shapes, vertex editing, snap, Split

**Use when:** fixing a vertex-editing bug, changing snap behavior, or touching Split.

- **Authoritative:** [18_DRAWING_ENGINE.md](18_DRAWING_ENGINE.md) — Shape data model, coordinate
  spaces, snap rules, the Split algorithm and its "exactly 2 crossings" contract.
- **Supporting:** [14_DOMAIN_MODEL.md](14_DOMAIN_MODEL.md) §3 (Shape as VO, INV-1),
  [05_PRODUCT_DECISIONS.md](05_PRODUCT_DECISIONS.md) PD-009 (why Split exists and what it must
  never replace — manual per-polygon drawing stays a first-class path).
- **Consult if relevant:** [23_API.md](23_API.md) §2.1 (`canSplit`/`split`/`removeVertex` return
  `Result`, never throw — a real, user-reachable failure path, not a programmer error);
  `27_NOTES/PHASE_4_IMPLEMENTATION_ISSUES.md` ISS-001 (Split-line-touches-an-existing-vertex is a
  known, explicitly PARKED edge case — don't silently redefine its behavior); [22_TDD.md](22_TDD.md)
  §5.2 (non-convex L/U-shape golden fixtures — never weakened without an explicit PD-equivalent).

## 5. UI workflow & visual design

**Use when:** changing a screen, an interaction flow, a keyboard shortcut, a component's visuals,
or panel/toolbar layout.

- **Authoritative:** [15_UX_SPECIFICATION.md](15_UX_SPECIFICATION.md) (screens, flows §5,
  interaction patterns §14, keyboard shortcuts §13 — the document this repo's own history shows
  being amended in place, with PO approval, as UI behavior evolves), [16_DESIGN_SYSTEM.md](16_DESIGN_SYSTEM.md)
  (tokens/components/iconography — "no screen uses a style outside this document").
- **Supporting:** [11_INFORMATION_ARCHITECTURE.md](11_INFORMATION_ARCHITECTURE.md) §2 (panel
  taxonomy — which region of the screen owns which kind of content), [12_WORKSPACES.md](12_WORKSPACES.md)
  (what varies per workspace vs. what's structurally fixed everywhere).
- **Consult if relevant:** [07_COMPETITIVE_ANALYSIS.md](07_COMPETITIVE_ANALYSIS.md) (pattern
  justification), `docs/mockups/studio_hifi_mockup.html` (referenced visual reference, 15 §7 — not
  a spec, a rendered illustration of one).

## 6. Architecture, module boundaries & persistence

**Use when:** making a cross-layer change, adding an adapter, changing where/how data is stored,
adding an API surface, or anything that shifts which module owns what.

- **Authoritative:** [21_ARCHITECTURE.md](21_ARCHITECTURE.md) (4-layer structure, dependency
  direction — UI → Application → Core, Adapters implement Core/Application interfaces — enforced
  by `eslint-plugin-boundaries`), [23_API.md](23_API.md) (concrete contract signatures — §1: an
  interface is owned by the layer that defines it, not the one that calls it), the relevant
  [26_ADR/ADR-*.md](26_ADR/) for the specific decision already made (persistence → ADR-004; sync
  conflicts → ADR-005; rendering → ADR-002; extension isolation → ADR-003; undo → ADR-001; UI
  framework → ADR-006; backend hosting/framework → ADR-007; frontend hosting → ADR-008).
- **Supporting:** [14_DOMAIN_MODEL.md](14_DOMAIN_MODEL.md) §2 (aggregate boundaries, which drive
  persistence transaction boundaries).
- **Consult if relevant:** [22_TDD.md](22_TDD.md) §2 (contract-test pattern — a fake and a real
  adapter implementation must pass the identical suite); `APPLICATION_LAYER_REVIEW.md` and
  `PERSISTENCE_CHECKPOINT_REVIEW.md` **only as historical context** on how the current
  Application/Adapters layers came to exist — not as a spec for their current behavior.

## 7. AI behavior

**Use when:** touching AI boundary detection, the Ghost proposal/commit lifecycle, or any
AI-orchestration code.

- **Authoritative:** [20_AI_STRATEGY.md](20_AI_STRATEGY.md) (Ghost state machine, confidence
  policy, the non-negotiable "AI never has its own persistence path — every accepted proposal
  goes through the same `DrawingEngine.create()` pipeline as manual drawing" invariant).
- **Supporting:** [05_PRODUCT_DECISIONS.md](05_PRODUCT_DECISIONS.md) PD-013 (AI-forward,
  human-committed — AI is never a required dependency of a core flow), PD-016 (Medical detection
  is PARKED — zero references, not just an inactive feature).
- **Consult if relevant — and check this *first*:** `27_NOTES/PHASE_4_IMPLEMENTATION_ISSUES.md`
  ISS-009: AI orchestration beyond the already-shipped `commitGhostCommand` is **explicitly
  deferred**, reopened only by explicit PO approval after hands-on product testing — not by
  "the next slice in sequence." Confirm this gate's status before starting AI-orchestration work.

## 8. Cross-cutting, every task

- **Test discipline:** [22_TDD.md](22_TDD.md) — the invariant→test traceability matrix and the
  test-pyramid-by-layer table apply regardless of which category above a task falls into.
- **Commit/process conventions:** [../CONTRIBUTING.md](../CONTRIBUTING.md) — commit type/scope
  taxonomy, the docs/implementation two-track rule, and the binding Documentation Synchronization
  clause (a change that invalidates a doc isn't done until the doc is updated, in its own `docs:`
  commit).

## 9. Historical / point-in-time only — never authoritative for current behavior

These are dated snapshots, each explicitly "review only, zero production code," never
retroactively edited. Read them only to understand *why* something was built a certain way at a
point in time, never as a source of current requirements:

[PHASE_2_REVIEW.md](PHASE_2_REVIEW.md) · [PHASE_3_REVIEW.md](PHASE_3_REVIEW.md) ·
[APPLICATION_LAYER_REVIEW.md](APPLICATION_LAYER_REVIEW.md) ·
[UI_CHECKPOINT_REVIEW.md](UI_CHECKPOINT_REVIEW.md) ·
[TOOL_DOCK_CHECKPOINT_REVIEW.md](TOOL_DOCK_CHECKPOINT_REVIEW.md) ·
[CALIBRATION_UI_CHECKPOINT_REVIEW.md](CALIBRATION_UI_CHECKPOINT_REVIEW.md) ·
[PROPERTY_PANEL_VERTEX_EDITING_CHECKPOINT_REVIEW.md](PROPERTY_PANEL_VERTEX_EDITING_CHECKPOINT_REVIEW.md) ·
[SPLIT_CHECKPOINT_REVIEW.md](SPLIT_CHECKPOINT_REVIEW.md) ·
[PERSISTENCE_CHECKPOINT_REVIEW.md](PERSISTENCE_CHECKPOINT_REVIEW.md) ·
[PRE_USER_TESTING_CHECKPOINT_REVIEW.md](PRE_USER_TESTING_CHECKPOINT_REVIEW.md) ·
[27_NOTES/PRODUCT_REVIEW_BIBLE_v1.0.md](27_NOTES/PRODUCT_REVIEW_BIBLE_v1.0.md)

`27_NOTES/PHASE_4_IMPLEMENTATION_ISSUES.md` is the one exception in `27_NOTES/` — it's a *living*
backlog (entries move OPEN → RESOLVED/DEFERRED in place), not a frozen snapshot; see the relevant
category above for which ISS-### entries matter to which kind of task.
