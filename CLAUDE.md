# AreaFlow — Engineering Rules

AreaFlow has a large, deliberately-layered documentation corpus (`docs/`). This file is the
top-level rulebook; it does not restate that corpus — it tells you when and how to consult it.
**Read [docs/INDEX.md](docs/INDEX.md) before starting any non-trivial task.** It routes a task to
the specific documents that govern it.

## 1. Documentation-first, not documentation-instead-of

Before writing or changing behavior:

1. Classify the task using [docs/INDEX.md](docs/INDEX.md)'s routing categories.
2. Read that category's **authoritative** document(s) for the relevant section — not the whole
   file, not the whole corpus. Skim supporting docs only if the authoritative one references an
   open question or you need the "why."
3. If nothing in `docs/` covers the task, say so explicitly rather than inventing product
   behavior — this is a documented-first product (05_PRODUCT_DECISIONS.md's own process rule:
   "no hidden assumptions").

Do not re-derive product rules, architecture, or UX flows from reading source code alone when a
doc already states them — the doc is the source of truth for *intent*; the code is the source of
truth for *current implementation*. When they disagree, that is a conflict to surface (§3), not
something to silently resolve in either direction.

## 2. Authority tiers (highest first)

| Tier | Documents | How it changes |
|------|-----------|-----------------|
| **Frozen product truth** | `docs/PRODUCT_BIBLE.md`, `docs/05_PRODUCT_DECISIONS.md` | **Never edit directly.** Bible is read-only (PD-020). Product evolution happens *only* by appending a new PD entry to 05, with explicit PO approval. |
| **Accepted architectural decisions** | `docs/26_ADR/ADR-*.md` | Authoritative for the specific "how" question each one answers. Superseding one means writing a new ADR that says so explicitly — never silently contradicting an existing one in code. |
| **Approved domain/engine specs** | `docs/14_DOMAIN_MODEL.md`, `docs/17_MEASUREMENT_ENGINE.md`, `docs/18_DRAWING_ENGINE.md`, `docs/19_IMPORT_EXPORT.md`, `docs/20_AI_STRATEGY.md`, `docs/21_ARCHITECTURE.md`, `docs/22_TDD.md`, `docs/23_API.md` | Living specs, edited in place when implementation reveals a genuine gap — but a correction that changes *product* behavior still needs a PD, not just an edit (PD-019 boundary, §3 below). |
| **Living UX/design specs** | `docs/11_INFORMATION_ARCHITECTURE.md`, `docs/15_UX_SPECIFICATION.md`, `docs/16_DESIGN_SYSTEM.md`, `docs/12_WORKSPACES.md` | Editable in place with PO approval (unlike the frozen tier) — this is how the routing work in this repo's own history has proceeded (UX spec wording amended in a dedicated `docs:` commit after explicit approval). |
| **Contextual/supporting** | `docs/07_COMPETITIVE_ANALYSIS.md`, `docs/08_PERSONAS.md`, `docs/09_USER_JOURNEYS.md`, `docs/10_USER_STORIES.md` | Rationale behind UX/product decisions. Consult when justifying or challenging a UX choice — never as a primary spec for implementation detail. |
| **Living issue backlog** | `docs/27_NOTES/PHASE_4_IMPLEMENTATION_ISSUES.md` | Tracks known open/deferred implementation issues (ISS-###). Check it for the relevant area before implementing — an issue may already document the exact edge case, its resolution direction, or an explicit gate (e.g. AI work, ISS-009). |
| **Historical / point-in-time** | `docs/PHASE_2_REVIEW.md`, `docs/PHASE_3_REVIEW.md`, `docs/APPLICATION_LAYER_REVIEW.md`, every `docs/*_CHECKPOINT_REVIEW.md`, `docs/27_NOTES/PRODUCT_REVIEW_BIBLE_v1.0.md` | **Never authoritative for current behavior.** Each is a dated snapshot of what shipped at that moment ("нула production код тук" is their own rule) and is never retroactively edited. Useful only for "why did we build it this way," never for "what should it do now." |
| **Process** | `CONTRIBUTING.md` (root) | Git/commit conventions, scope taxonomy, and the binding **Documentation Synchronization** rule: a code change that invalidates a doc is not "done" until the doc is updated, in a separate `docs:` commit. |

## 3. Conflict rules

- **Bible/PD vs. everything else:** Bible/PD win on product intent. If an engine spec, ADR, or
  code contradicts them, the spec/code is wrong and gets corrected — never the Bible/PD entry,
  except by a new PD.
- **"What" vs. "how" (PD-019, the load-bearing boundary rule):** a decision that changes a
  *product capability* (what the user can do) needs a Product Decision. A decision that changes
  *how* an already-decided capability is built (storage engine, renderer, framework, sync
  strategy) needs an ADR, not a PD. When genuinely unsure which side a decision falls on, that
  itself is the question to raise before proceeding — do not default to skipping both.
- **Doc vs. code:** if running code visibly disagrees with an authoritative doc (frozen or
  approved tier), do not silently pick a side. State the discrepancy and which one you believe is
  stale, then proceed per explicit instruction — this mirrors the existing "no silent
  documentation drift" rule in `CONTRIBUTING.md`, extended to the reverse direction (silent *code*
  drift past a doc is equally not allowed).
- **Historical docs never override current specs.** A `*_CHECKPOINT_REVIEW.md` describing an
  older, simpler behavior is not a reason to revert or ignore a later, more complete spec.

## 4. When an ADR or Product Decision must be consulted before coding

- The task adds or removes a **user-facing capability**, or changes v1 scope → check
  `05_PRODUCT_DECISIONS.md` first; it may already be decided (or explicitly out of scope/PARKED),
  or may need a new PD before implementation.
- The task touches a domain already governed by an existing ADR — **Undo/Redo** (ADR-001),
  **canvas rendering** (ADR-002), **extension sandboxing** (ADR-003), **local storage** (ADR-004),
  **sync conflicts** (ADR-005), **UI framework** (ADR-006) — read that ADR first. Don't
  re-litigate or quietly bypass it; if it's genuinely wrong, that's a new ADR, stated as such.
- The task is **AI-orchestration work** (anything beyond the already-implemented
  `commitGhostCommand`) → this is explicitly gated: `27_NOTES/PHASE_4_IMPLEMENTATION_ISSUES.md`
  ISS-009 requires explicit PO approval to open, independent of any other readiness signal. Check
  its current status before starting.
- The task is a genuine **architectural** change (new module boundary, new adapter category, a
  layering rule change) → read `21_ARCHITECTURE.md` §3 (dependency direction, enforced by
  `eslint-plugin-boundaries`) before touching import structure.

## 5. Engineering conventions (routes, not restates)

- Commit conventions, the docs/implementation "two-track" split, and the Documentation
  Synchronization rule: `CONTRIBUTING.md`.
- Test taxonomy and the invariant→test traceability discipline: `docs/22_TDD.md`.
- Layer boundaries (Core has zero UI/Adapter dependencies; dependency direction is UI →
  Application → Core, Adapters implement Core/Application-defined interfaces): `docs/21_ARCHITECTURE.md`
  §2–§3, enforced by `eslint.config.js`.

## 6. Scope of this file

This file and `docs/INDEX.md` are a **routing layer only**. They do not contain product
requirements, architecture decisions, or UX specifications themselves — those stay exactly where
they already live. Do not duplicate doc content back into this file as it grows; add a pointer.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/`, not GitHub Issues. See
`docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`,
`wontfix`), recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context, but not the generic `CONTEXT.md`/`docs/adr/` convention — points at this repo's
existing corpus (`docs/INDEX.md`, `docs/14_DOMAIN_MODEL.md`, `docs/26_ADR/`) and its authority
tiers instead. See `docs/agents/domain.md`.
