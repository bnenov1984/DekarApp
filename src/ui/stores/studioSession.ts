import { writable, derived, get } from 'svelte/store';
import { CommandStack, type Command } from '../../application/commandStack.js';
import type { Measurement, MeasurementId, Surface, VertexLabel } from '../../core/domain/entities.js';
import { hitTestShape } from '../../core/drawing/hitTest.js';
import type { Point } from '../../core/domain/types.js';
import { surfaceRepository, persist } from './persistence.js';
import { deleteMeasurementsCommand } from '../../application/commands/deleteMeasurement.js';
import { duplicateMeasurementsCommand } from '../../application/commands/duplicateMeasurement.js';
import { reorderMeasurementsCommand } from '../../application/commands/reorderMeasurements.js';
import { resizeImageCommand } from '../../application/commands/resizeImage.js';
import { setImageLockedCommand } from '../../application/commands/setImageLocked.js';
import { setMeasurementLockedCommand } from '../../application/commands/setMeasurementLocked.js';
import { setVertexLabelCommand } from '../../application/commands/setVertexLabel.js';
import { setManualAreaCommand } from '../../application/commands/setManualArea.js';
import { setLabelOffsetCommand } from '../../application/commands/setLabelOffset.js';
import { viewOnly } from './panelLayoutSession.js';

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
/** PO follow-up (UX review, item A13 "multi-select") — the source of truth for selection is now a
 * Set, not a single id; every selection entrypoint below (selectMeasurement, selectMeasurements,
 * toggleMeasurementSelection, selectBackground, deselectAll) goes through this one store. */
export const selectedMeasurementIds = writable<ReadonlySet<MeasurementId>>(new Set());
/** Derived convenience view — non-null only when *exactly one* Measurement is selected.
 * Every consumer that only makes sense for a single shape (PropertyPanel's full Identity/Values/
 * Notes view, the X-to-split shortcut, entering vertex-edit mode, StatusBar's single-measurement
 * hint) reads this instead of `selectedMeasurementIds` directly — it's deliberately `null` (not
 * "pick one arbitrarily") for 0 *or* >1 selected, so none of those single-shape affordances ever
 * silently guess which one the user meant. */
export const selectedMeasurementId = derived(selectedMeasurementIds, (ids) => (ids.size === 1 ? [...ids][0]! : null));
/** PO follow-up (background layer selectability) — the Background "layer" isn't a Measurement
 * (no shape, no id in Layer.measurements, entities.ts), so it can't live in
 * `selectedMeasurementIds`; this is its own flag, kept mutually exclusive with a Measurement
 * selection by construction (every selection entrypoint below clears the other side).
 * CanvasStage/MeasurementList/PropertyPanel all read it to know when to show the image's resize
 * handles / a Background Properties section. */
export const backgroundSelected = writable(false);
/** PO follow-up (locked-background click hint) — bumped, not toggled, so a rapid repeat click
 * retriggers the Layers panel's flash animation even mid-animation; consumers only watch for a
 * change, never read the number itself. */
export const backgroundLockFlash = writable(0);

let stack: CommandStack | null = null;

function refreshUndoState(): void {
  canUndo.set(stack?.canUndo() ?? false);
  canRedo.set(stack?.canRedo() ?? false);
}

export function initStudioSession(surface: Surface): void {
  stack = new CommandStack();
  activeSurface.set(surface);
  selectedMeasurementIds.set(new Set());
  backgroundSelected.set(false);
  refreshUndoState();
}

export function endStudioSession(): void {
  stack = null;
  activeSurface.set(null);
  selectedMeasurementIds.set(new Set());
  backgroundSelected.set(false);
  refreshUndoState();
}

function allMeasurements(surface: Surface): Measurement[] {
  return surface.layers.flatMap((l) => l.measurements);
}

/** 21 §6.3 — hit-testing lives against the Surface-space point the caller (CanvasStage) already
 * converted from screen coordinates. Topmost-drawn wins on overlap (last in render order, i.e.
 * last layer's last measurement) — matches ordinary z-order expectations. `null` = nothing under
 * the point (including a background image — that's not a Measurement). A pure lookup, no store
 * mutation, so both a "select" gesture (clears on a miss) and a "only act on a hit" gesture
 * (double-click) can share it without one dictating the other's miss behavior. */
export function findMeasurementAt(surface: Surface, point: Point, tolerance = 4): MeasurementId | null {
  const measurements = allMeasurements(surface);
  for (let i = measurements.length - 1; i >= 0; i--) {
    const measurement = measurements[i]!;
    // PO follow-up (UX review, item A5 "eye icon = real visibility") — a hidden Measurement isn't
    // drawn (sceneRenderer.ts), so it shouldn't be clickable where it used to be either; it stays
    // fully reachable from the Layers panel (MeasurementList.svelte's row click doesn't go through
    // this function at all), just not from the canvas.
    // PO request ("fix overlapping vertex selection and locked layers") — a locked Measurement is
    // "visible but non-interactive": excluding it here means it can never become the topmost hit,
    // never gets selected, never receives a vertex-edit drag attempt, and critically can no longer
    // win the topmost-hit race against an unlocked neighbor sharing a coincident vertex/edge — the
    // loop below just continues to the next (lower) Measurement instead. Still fully reachable
    // from the Layers panel (its row click bypasses this function entirely, same D8 pattern as
    // `hidden` above), so locking/unlocking from the list keeps working.
    if (measurement.identity.hidden || measurement.locked) continue;
    if (hitTestShape(point, measurement.shape, tolerance)) return measurement.id;
  }
  return null;
}

/** Click-to-select (21 §6.3): a Measurement hit-test only, deselecting on a miss. Tolerance is in
 * Surface units, not screen pixels — the caller is responsible for that conversion once zoom
 * exists (not yet, 21 §3 open item). Superseded as CanvasStage's direct click handler by the
 * background-aware combination of `findMeasurementAt`/`selectMeasurement`/`selectBackground`/
 * `deselectAll` below (a plain click over the background image now selects it instead of
 * deselecting) — kept as a narrower measurement-only utility, still exercised directly by tests. */
export function selectMeasurementAt(point: Point, tolerance = 4): void {
  const surface = get(activeSurface);
  if (!surface) return;
  backgroundSelected.set(false);
  const id = findMeasurementAt(surface, point, tolerance);
  selectedMeasurementIds.set(id ? new Set([id]) : new Set());
}

/** Direct selection by id — the Measurement List panel's equivalent of clicking a shape on the
 * canvas (D8, 15 §12: every canvas action has a list counterpart). Both paths converge on the
 * same store, so canvas and list selection are always in sync by construction. Replaces the whole
 * selection with just this one id (or clears it, for `null`) — the plain-click contract; clears
 * any Background selection too (mutual exclusivity, backgroundSelected's own comment above). */
export function selectMeasurement(id: MeasurementId | null): void {
  backgroundSelected.set(false);
  selectedMeasurementIds.set(id ? new Set([id]) : new Set());
}

/** PO follow-up (UX review, item A13 "multi-select") — Shift-click's toggle-membership behavior
 * (CanvasStage.svelte / MeasurementList.svelte), the standard "add/remove just this one from the
 * current selection" gesture every selection-capable tool has. Clears any Background selection
 * the same way every other Measurement-selecting entrypoint here does (mutual exclusivity). */
export function toggleMeasurementSelection(id: MeasurementId): void {
  backgroundSelected.set(false);
  selectedMeasurementIds.update((ids) => {
    const next = new Set(ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}

/** PO follow-up (UX review, item A13 "multi-select") — replaces the whole selection with exactly
 * `ids`; the marquee/rubber-band drag's entrypoint (CanvasStage.svelte) — every Measurement whose
 * bounds intersect the drag rect becomes the new selection. Same "replace, don't merge" contract
 * as a plain click; a Shift-held marquee unions with the pre-drag selection itself before calling
 * this (CanvasStage's job, not this function's). Also used to select every fresh copy right after
 * a bulk duplicate. */
export function selectMeasurements(ids: Iterable<MeasurementId>): void {
  backgroundSelected.set(false);
  selectedMeasurementIds.set(new Set(ids));
}

/** PO follow-up (background layer selectability) — CanvasStage's click-to-select routes a hit on
 * the background image's bounds here (single click, Select tool) instead of deselecting, so the
 * Background row in Layers/Properties behaves the same "click it to select it" way every other
 * layer already does. Mutually exclusive with a Measurement selection (clears it). */
export function selectBackground(): void {
  selectedMeasurementIds.set(new Set());
  backgroundSelected.set(true);
}

/** PO follow-up (deselect-on-empty-click / Escape) — clears both selection channels at once, the
 * single entrypoint "click empty space" / Escape / anything else meaning "select nothing" should
 * call, so neither a stale Measurement selection nor a stale Background selection can survive it. */
export function deselectAll(): void {
  selectedMeasurementIds.set(new Set());
  backgroundSelected.set(false);
}

/** PO follow-up (locked-background click hint) — CanvasStage calls this when a Select-tool click
 * lands on the (locked) background image, so the Layers panel's lock icon can flash and answer
 * "why didn't that do anything" without a dialog/toast. Pure UI feedback; `selectBackground`
 * (called alongside it) already covers the actual selection side effect of that same click. */
export function flashBackgroundLock(): void {
  backgroundLockFlash.update((n) => n + 1);
}

/**
 * Commands capture the Surface they were built against (Application layer design: the prior
 * value lives inside the command, 14 §3 / ADR-001). The factory-callback shape here exists so
 * every command is *always* built against the current store value at execution time — a caller
 * holding a stale Surface reference can't accidentally rebase the session backwards.
 * Throws propagate untouched (validation errors etc. — CommandStack guarantees the stack is
 * unpolluted, commandStack.ts); callers translate them to non-blocking hints (15 §16).
 */
// PD-022 / 15 §11 — below 1024px the Studio is view-only. Every change to the project goes through
// executeCommand/undo/redo, so refusing here is the guarantee; the UI also hides the editing
// controls, so this normally never triggers.
export function executeCommand(buildCommand: (surface: Surface) => Command<Surface>): void {
  if (get(viewOnly)) return;
  const surface = get(activeSurface);
  if (!stack || !surface) throw new Error('executeCommand: no active studio session');
  const result = stack.execute(buildCommand(surface));
  activeSurface.set(result);
  refreshUndoState();
  autosave(result);
}

export function undo(): void {
  if (!stack || get(viewOnly)) return;
  const restored = stack.undo<Surface>();
  if (restored !== undefined) {
    activeSurface.set(restored);
    autosave(restored);
  }
  refreshUndoState();
}

export function redo(): void {
  if (!stack || get(viewOnly)) return;
  const result = stack.redo<Surface>();
  if (result !== undefined) {
    activeSurface.set(result);
    autosave(result);
  }
  refreshUndoState();
}

/** 11 §4 — deletes every currently selected Measurement, if any (no-op otherwise; works
 * identically for a single selection or item A13's multi-select). Split-parent/split-child/
 * plain-measurement lifecycle rules, and the "one atomic undo step for the whole batch" guarantee,
 * both already live in `deleteMeasurementsCommand` itself — this only resolves "which ids" from
 * the current selection and clears it afterward, since whatever was selected is now guaranteed
 * gone (a cascade-deleted child could never still be part of the selection). */
export function deleteSelectedMeasurement(): void {
  const allMeasurements = get(activeSurface)?.layers.flatMap((l) => l.measurements) ?? [];
  // entities.ts's own contract for `locked` — deletion is refused for a locked Measurement, same
  // "protection from accidental editing" as move/resize/vertex-edit/split. Locked ids are dropped
  // from the batch rather than blocking the whole delete (so deleting a mixed locked/unlocked
  // multi-selection still removes whatever it can) and stay selected afterward, since they're
  // still there.
  const ids = [...get(selectedMeasurementIds)].filter((id) => !allMeasurements.find((m) => m.id === id)?.locked);
  if (ids.length === 0) return;
  executeCommand((surface) => deleteMeasurementsCommand({ surface, measurementIds: ids }));
  selectedMeasurementIds.update((current) => new Set([...current].filter((id) => !ids.includes(id))));
}

/** PO follow-up (UX review, item B6 "Ctrl+D duplicate", generalized for item A13 "multi-select
 * bulk operations") — clones every selected Measurement with a small fixed offset (so the copies
 * are visibly distinct and immediately draggable away without first hunting for them under the
 * originals), as one atomic undo step, then selects every copy — ready to reposition right away.
 * No-op without a Measurement selection (Background has no duplicate concept), same
 * "no selection, no-op" pattern as deleteSelectedMeasurement. */
const DUPLICATE_OFFSET_SURFACE_UNITS = 16;

export function duplicateSelectedMeasurement(): void {
  const ids = [...get(selectedMeasurementIds)];
  if (ids.length === 0) return;
  const newIds: MeasurementId[] = ids.map(() => crypto.randomUUID());
  executeCommand((surface) =>
    duplicateMeasurementsCommand({
      surface,
      measurementIds: ids,
      newMeasurementIds: newIds,
      dx: DUPLICATE_OFFSET_SURFACE_UNITS,
      dy: DUPLICATE_OFFSET_SURFACE_UNITS,
    }),
  );
  selectMeasurements(newIds);
}

/** Layers panel drag-to-reorder (PO request): `orderedIdsFrontToBack` is the panel's complete
 * row order after a drop, topmost row first. Selection is left untouched — reordering doesn't
 * change what's selected, only its stacking position. */
export function reorderMeasurements(orderedIdsFrontToBack: MeasurementId[]): void {
  executeCommand((surface) => reorderMeasurementsCommand({ surface, orderedIdsFrontToBack }));
}

/** PO request (resizable imported image) — commits a corner-drag result (imageResizeSession.ts's
 * pointerUp) to the Surface, undoable same as everything else here. */
export function resizeImage(origin: Point, width: number, height: number): void {
  executeCommand((surface) => resizeImageCommand({ surface, origin, width, height }));
}

/** PO request (lockable Background layer) — toggles whether the background image can be
 * resized/moved at all (CanvasStage.svelte / imageResizeSession.ts gate on it). */
export function setImageLocked(locked: boolean): void {
  executeCommand((surface) => setImageLockedCommand({ surface, locked }));
}

/** PO follow-up ("per-measurement lock") — toggles whether a single Measurement can be moved/
 * resized/vertex-edited/deleted/split (vertexEditSession.ts's enterVertexEditing, this module's
 * own deleteSelectedMeasurement, splitSession.ts's startSplit all gate on it). */
export function setMeasurementLocked(measurementId: MeasurementId, locked: boolean): void {
  executeCommand((surface) => setMeasurementLockedCommand({ surface, measurementId, locked }));
}

/** PO request (per-vertex annotation) — sets/clears one vertex's label (`label: null` clears
 * it). `vertexIndex` follows the same convention as `resizeHandlePoints`/`findHandleIndexAt`. */
export function setVertexLabel(measurementId: MeasurementId, vertexIndex: number, label: VertexLabel | null): void {
  executeCommand((surface) => setVertexLabelCommand({ surface, measurementId, vertexIndex, label }));
}

/** PO request (manual area) — sets/clears a Measurement's explicit real-world area (m²),
 * independent of Surface.calibration (entities.ts's `manualArea`, setManualArea.ts). `null`
 * reverts to geometry/calibration-derived area. */
export function setManualArea(measurementId: MeasurementId, manualAreaM2: number | null): void {
  executeCommand((surface) => setManualAreaCommand({ surface, measurementId, manualAreaM2 }));
}

/** PO request (draggable polygon labels) — persists where a Polygon's label was dragged to
 * (Surface-space delta from its centroid, setLabelOffset.ts). Called only once a drag actually
 * moved and landed inside the polygon (labelDragSession.ts owns that gate). */
export function setLabelOffset(measurementId: MeasurementId, dx: number, dy: number): void {
  executeCommand((surface) => setLabelOffsetCommand({ surface, measurementId, dx, dy }));
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
      selectedMeasurementIds,
      selectMeasurementAt,
      findMeasurementAt,
      selectMeasurement,
      toggleMeasurementSelection,
      selectMeasurements,
      backgroundSelected,
      selectBackground,
      deselectAll,
      backgroundLockFlash,
      flashBackgroundLock,
      deleteSelectedMeasurement,
      duplicateSelectedMeasurement,
      reorderMeasurements,
      resizeImage,
      setImageLocked,
      setMeasurementLocked,
      setVertexLabel,
      setManualArea,
      setLabelOffset,
      get,
    },
  });
}
