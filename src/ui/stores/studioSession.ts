import { writable, get } from 'svelte/store';
import { CommandStack, type Command } from '../../application/commandStack.js';
import type { Measurement, MeasurementId, Surface } from '../../core/domain/entities.js';
import { hitTestShape } from '../../core/drawing/hitTest.js';
import type { Point } from '../../core/domain/types.js';
import { surfaceRepository, persist } from './persistence.js';
import { deleteMeasurementCommand } from '../../application/commands/deleteMeasurement.js';
import { reorderMeasurementsCommand } from '../../application/commands/reorderMeasurements.js';

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
export const selectedMeasurementId = writable<MeasurementId | null>(null);

let stack: CommandStack | null = null;

function refreshUndoState(): void {
  canUndo.set(stack?.canUndo() ?? false);
  canRedo.set(stack?.canRedo() ?? false);
}

export function initStudioSession(surface: Surface): void {
  stack = new CommandStack();
  activeSurface.set(surface);
  selectedMeasurementId.set(null);
  refreshUndoState();
}

export function endStudioSession(): void {
  stack = null;
  activeSurface.set(null);
  selectedMeasurementId.set(null);
  refreshUndoState();
}

function allMeasurements(surface: Surface): Measurement[] {
  return surface.layers.flatMap((l) => l.measurements);
}

/** 21 §6.3 — hit-testing lives against the Surface-space point the caller (CanvasStage) already
 * converted from screen coordinates. Topmost-drawn wins on overlap (last in render order, i.e.
 * last layer's last measurement) — matches ordinary z-order expectations. `null` clears
 * selection (click on empty canvas). Tolerance is in Surface units, not screen pixels — the
 * caller is responsible for that conversion once zoom exists (not yet, 21 §3 open item). */
export function selectMeasurementAt(point: Point, tolerance = 4): void {
  const surface = get(activeSurface);
  if (!surface) return;
  const measurements = allMeasurements(surface);
  for (let i = measurements.length - 1; i >= 0; i--) {
    const measurement = measurements[i]!;
    if (hitTestShape(point, measurement.shape, tolerance)) {
      selectedMeasurementId.set(measurement.id);
      return;
    }
  }
  selectedMeasurementId.set(null);
}

/** Direct selection by id — the Measurement List panel's equivalent of clicking a shape on the
 * canvas (D8, 15 §12: every canvas action has a list counterpart). Both paths converge on the
 * same store, so canvas and list selection are always in sync by construction. */
export function selectMeasurement(id: MeasurementId | null): void {
  selectedMeasurementId.set(id);
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
  autosave(result);
}

export function undo(): void {
  if (!stack) return;
  const restored = stack.undo<Surface>();
  if (restored !== undefined) {
    activeSurface.set(restored);
    autosave(restored);
  }
  refreshUndoState();
}

export function redo(): void {
  if (!stack) return;
  const result = stack.redo<Surface>();
  if (result !== undefined) {
    activeSurface.set(result);
    autosave(result);
  }
  refreshUndoState();
}

/** 11 §4 — deletes the currently selected Measurement, if any (no-op otherwise). Split-parent/
 * split-child/plain-measurement lifecycle rules all already live in `deleteMeasurementCommand`
 * itself (cascade to children / dissolve the group for siblings / plain removal) — this only
 * resolves "which id" from the current selection and clears it afterward, since whatever was
 * selected is now guaranteed gone (a cascade-deleted child could never still be the selection). */
export function deleteSelectedMeasurement(): void {
  const id = get(selectedMeasurementId);
  if (!id) return;
  executeCommand((surface) => deleteMeasurementCommand({ surface, measurementId: id }));
  selectedMeasurementId.set(null);
}

/** Layers panel drag-to-reorder (PO request): `orderedIdsFrontToBack` is the panel's complete
 * row order after a drop, topmost row first. Selection is left untouched — reordering doesn't
 * change what's selected, only its stacking position. */
export function reorderMeasurements(orderedIdsFrontToBack: MeasurementId[]): void {
  executeCommand((surface) => reorderMeasurementsCommand({ surface, orderedIdsFrontToBack }));
}

/** PD-012 D6 — "no Save button": every settled mutation (execute/undo/redo) persists
 * fire-and-forget, never blocking the UI thread. Failures surface non-blockingly via
 * `persistence.ts`'s `storageErrorMessage`, not a thrown error back into caller code. */
function autosave(surface: Surface): void {
  void persist(() => surfaceRepository.save(surface));
}

// Dev-only debug handle for browser-level verification (preview tooling / future e2e): exposes
// the session API on window in dev builds only. Stripped from production bundles by Vite's
// dead-code elimination (import.meta.env.DEV is statically false there). Not a public API.
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  Object.assign(window as object, {
    __areaflowDev: {
      executeCommand,
      undo,
      redo,
      activeSurface,
      canUndo,
      canRedo,
      selectedMeasurementId,
      selectMeasurementAt,
      selectMeasurement,
      deleteSelectedMeasurement,
      reorderMeasurements,
      get,
    },
  });
}
