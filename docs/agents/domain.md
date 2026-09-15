# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo does **not** use the generic `CONTEXT.md` / `docs/adr/` convention. It already has a
large, governed documentation corpus with its own routing and authority rules — use that instead
of creating a parallel `CONTEXT.md`.

## Before exploring, read these

- **`docs/INDEX.md`** — the task router. Find the category closest to your task and read its
  authoritative document(s) for the relevant section, per `CLAUDE.md`'s authority-tier rules.
- **`docs/14_DOMAIN_MODEL.md`** — this repo's domain glossary and model of record: bounded
  contexts, aggregates (Surface is root, not Project), entities vs. value objects, invariants
  (INV-1…12), domain event vocabulary. Treat this as the `CONTEXT.md` equivalent.
- **`docs/26_ADR/ADR-*.md`** — this repo's ADRs (not `docs/adr/`). Read the ones that touch the
  area you're about to work in: ADR-001 (undo/redo), ADR-002 (rendering), ADR-003 (extension
  sandboxing), ADR-004 (local storage), ADR-005 (sync conflicts), ADR-006 (UI framework),
  ADR-007 (backend hosting).

This repo is single-context (no `CONTEXT-MAP.md`, no monorepo layout) — there is one corpus for
the whole codebase, not one per package.

## File structure

```
/
├── CLAUDE.md              ← top-level rulebook, authority tiers, conflict rules
└── docs/
    ├── INDEX.md            ← task router (read this first)
    ├── PRODUCT_BIBLE.md    ← frozen product truth
    ├── 05_PRODUCT_DECISIONS.md
    ├── 14_DOMAIN_MODEL.md  ← domain glossary / model of record
    ├── 21_ARCHITECTURE.md
    └── 26_ADR/
        ├── ADR-001-command-stack-undo.md
        └── ...
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a
test name), use the term as defined in `docs/14_DOMAIN_MODEL.md`. Don't drift to synonyms the
glossary explicitly avoids (e.g. "Surface" is the aggregate root — not "Project").

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing
language the project doesn't use (reconsider) or there's a real gap (note it for
`/domain-modeling` — but see the note below on how changes land in this repo).

## Flag ADR / doc conflicts

If your output contradicts an existing ADR or an authoritative doc, surface it explicitly rather
than silently overriding — this mirrors `CLAUDE.md` §3 (Conflict rules):

> _Contradicts ADR-005 (sync conflicts, LWW), but worth reopening because…_

## How domain-doc changes land here (differs from the generic skill assumption)

Unlike a plain `CONTEXT.md`/ADR setup, this repo's docs have authority tiers (`CLAUDE.md` §2):

- `docs/PRODUCT_BIBLE.md` and `docs/05_PRODUCT_DECISIONS.md` are frozen/append-only — never edit
  directly; product-capability changes need a new PD entry with explicit PO approval.
- `docs/26_ADR/ADR-*.md` are accepted decisions — superseding one means writing a new ADR that
  says so, never silently contradicting it in code or in a new doc.
- `docs/14_DOMAIN_MODEL.md` and other "approved domain/engine specs" are living — edit in place
  when implementation reveals a genuine gap, but a correction that changes product behavior still
  needs a PD, not just an edit.

So when `/domain-modeling` (or `/grill-with-docs`, `/improve-codebase-architecture`) would
normally create or edit a `CONTEXT.md`/ADR directly, it should instead propose the edit against
the correct existing file above, respecting whichever authority tier that file sits in.
