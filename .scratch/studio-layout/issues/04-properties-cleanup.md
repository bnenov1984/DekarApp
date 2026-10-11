# 04 — Properties: title-only header, Split in the body, Delete at the bottom

Status: resolved
Type: task
Blocked by: 03
Spec: ../spec.md · decision 6 · 16 §3.2 PropertyPanel

## What

- Header shows only "Properties". Lock button removed here (stays on Layers rows).
- Split becomes a normal button in the body (the split-into-parts row stays where it is).
- "Delete shape": full-width, low-emphasis, at the bottom; disabled on a locked shape.
  Backspace and the context menu still delete.

## Acceptance

Chrome: header has no buttons; Split and Delete work from their new places; locked shape →
Delete disabled, lock toggle on its Layers row still works.

## Comments

- 2026-10-11 — Done in `c5b495c`. Header is title-only (single and multi-select). Split is a
  secondary button in its own section after Values (16 §3.2 order: Identity / Values / Split /
  Notes); the parts config opens directly under it. "Delete shape" is full-width, low-emphasis,
  sticky at the bottom of the panel so it stays visible when Properties is short and scrolls;
  multi-select shows "Delete N shapes" the same way. Lock button removed from the panel.
  Chrome check (1400×900): header has 0 buttons; Split opens the config, split → 3 shapes, undo
  → 1; locking from the Layers row disables Delete and Split, unlocking re-enables them; Delete
  button, Backspace and context-menu Delete each remove the shape; Shift-multi-select shows
  "2 measurements selected" and deletes both. Tests 726 green, typecheck/svelte-check/lint clean.
