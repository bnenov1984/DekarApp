# 04 — Linked vertex delete

Status: ready-for-agent
Type: task
Blocked by: 02
Spec: ../spec.md · PD-024 §7–8 · 18 §6.1

## What

- `src/application/commands/removeVertex.ts`: optional `linked?: boolean` (default `true`); remove
  the vertex from every participant; any `!result.ok` or locked participant → throw; labels via
  `removeLabelAt` per shape.
- `vertexEditSession.ts`: the Alt+click pre-check runs `removeVertex` on every participant (silent
  rejection if any fails, 18 §6); Ctrl/⌘+Alt+click = single shape.

## Acceptance

Roundtrip: removed from both; refused entirely when one participant would drop below 3 vertices or
self-intersect; locked refuses; labels shift per shape; undo restores both. Session test for the
pre-check.

## Comments
