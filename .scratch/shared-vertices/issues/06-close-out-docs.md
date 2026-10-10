# 06 — Close-out (docs)

Status: resolved
Type: task
Blocked by: 03, 04, 05

## What (separate `docs:` commit)

- `docs/22_TDD.md` T-INV-19: replace "предстои" with the real test file/describe names.
- `docs/18_DRAWING_ENGINE.md` §5: locked neighbour → T-junction insertion skipped; §6.1: survivors
  of a dissolved Split group link to the former parent (PO, 2026-10-10).
- `../spec.md`: `Status: resolved` + a Comments entry listing the implementing commits.

## Comments

**2026-10-10 — resolved.** Docs updated in this commit. Also corrected 18 §6.1's snap sentence
to match the implementation: the participants' shapes are excluded entirely, not only their linked
vertices. The PD-024 §4 hit-test deviation is recorded in the spec's Comments as an open item; 18
§6.1 still states the decided rule.
