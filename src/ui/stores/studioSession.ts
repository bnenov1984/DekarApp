import { writable, get } from 'svelte/store';
import { CommandStack, type Command } from '../../application/commandStack.js';
import type { Surface } from '../../core/domain/entities.js';

// The first UI -> Application integration point (21 §3 dependency direction: allowed downward
// import; the reverse would fail the ESLint boundaries rule). One CommandStack per Project
// session (21 §4.2, ADR-001) — initStudioSession() replaces the stack wholesale when a new
// project starts, which is exactly the "undo history is session-scoped" semantics (11 §7).
//
// Design decision deferred from ADR-006 ("Svelte stores vs context API"), resolved here:
// module-level stores, not component context. The session is app-global by definition (one
// project open at a time, 15 §4 — two screens, no parallel studios), keyboard shortcuts and
// future overlays (⌘K) need access from outside the Studio component tree, and stores are
// plain TS — testable in vitest without mounting components.

export const activeSurface = writable<Surface | null>(null);
export const canUndo = writable(false);
export const canRedo = writable(false);

let stack: CommandStack | null = null;

function refreshUndoState(): void {
  canUndo.set(stack?.canUndo() ?? false);
  canRedo.set(stack?.canRedo() ?? false);
}

export function initStudioSession(surface: Surface): void {
  stack = new CommandStack();
  activeSurface.set(surface);
  refreshUndoState();
}

export function endStudioSession(): void {
  stack = null;
  activeSurface.set(null);
  refreshUndoState();
}

/**
 * Commands capture the Surface they were built against (Application layer design: the prior
 * value lives inside the command, 14 §3 / ADR-001). The factory-callback shape here exists so
 * every command is *always* built against the current store value at execution time — a caller
 * holding a stale Surface reference can't accidentally rebase the session backwards.
 * Throws propagate untouched (validation errors etc. — CommandStack guarantees the stack is
 * unpolluted, commandStack.ts); callers translate them to non-blocking hints (15 §16).
 */
export function executeCommand(buildCommand: (surface: Surface) => Command<Surface>): void {
  const surface = get(activeSurface);
  if (!stack || !surface) throw new Error('executeCommand: no active studio session');
  const result = stack.execute(buildCommand(surface));
  activeSurface.set(result);
  refreshUndoState();
}

export function undo(): void {
  if (!stack) return;
  const restored = stack.undo<Surface>();
  if (restored !== undefined) activeSurface.set(restored);
  refreshUndoState();
}

export function redo(): void {
  if (!stack) return;
  const result = stack.redo<Surface>();
  if (result !== undefined) activeSurface.set(result);
  refreshUndoState();
}

// Dev-only debug handle for browser-level verification (preview tooling / future e2e): exposes
// the session API on window in dev builds only. Stripped from production bundles by Vite's
// dead-code elimination (import.meta.env.DEV is statically false there). Not a public API.
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  Object.assign(window as object, {
    __areaflowDev: { executeCommand, undo, redo, activeSurface, canUndo, canRedo, get },
  });
}
