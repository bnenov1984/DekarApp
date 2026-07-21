import { tick } from 'svelte';
import type { Measurement, MeasurementId, Surface } from '../../core/domain/entities.js';
import type { ContextMenuItem } from './contextMenuSession.js';
import {
  executeCommand,
  deleteSelectedMeasurement,
  duplicateSelectedMeasurement,
  setImageLocked,
  setMeasurementLocked,
} from '../stores/studioSession.js';
import { updateIdentityCommand } from '../../application/commands/updateIdentity.js';
import { startSplit } from '../stores/splitSession.js';

// PO follow-up (UX review, item A14 "no context menus") — shared between CanvasStage.svelte,
// MeasurementList.svelte, and MeasurementChip.svelte's right-click handlers so all three
// right-click surfaces (D8: canvas / list / chip) build the exact same menu for the exact same
// selection state, rather than three independently-maintained item lists quietly drifting apart.

/** Rename has no dedicated store-level "enter edit mode" signal (unlike the chip's own
 * double-click, which is component-local state) — this focuses the Properties panel's name field
 * instead, the same field the chip's inline rename ultimately commits through. `tick()` first
 * because the panel only renders once the caller has already selected the target (a fresh
 * selection this same click cycle), and Svelte's DOM update for that is one microtask away. */
async function focusNameInput(): Promise<void> {
  await tick();
  const input = document.querySelector<HTMLInputElement>('[data-testid="identity-name"]');
  input?.focus();
  input?.select();
}

/** Builds the right-click menu for whatever's currently selected in `selectedIds` — a single
 * Measurement gets the full set (Rename/Duplicate/Split/Hide/Delete); more than one gets only the
 * bulk-safe subset (Duplicate/Delete, item A13's own bulk operations) since Rename/Split/Hide only
 * ever make sense for exactly one shape. Empty selection returns no items (caller's
 * `openContextMenu` already no-ops on that, contextMenuSession.ts). */
export function buildMeasurementContextMenuItems(
  selectedIds: ReadonlySet<MeasurementId>,
  surface: Surface,
  splittingActive: boolean,
): ContextMenuItem[] {
  const count = selectedIds.size;
  if (count === 0) return [];

  const allMeasurements = surface.layers.flatMap((l) => l.measurements);
  const single: Measurement | null = count === 1 ? (allMeasurements.find((m) => selectedIds.has(m.id)) ?? null) : null;

  const items: ContextMenuItem[] = [];

  if (single) {
    items.push({ label: 'Rename', action: () => void focusNameInput() });
  }

  items.push({ label: count > 1 ? `Duplicate (${count})` : 'Duplicate', action: duplicateSelectedMeasurement });

  if (single && single.shape.type === 'polygon' && !single.locked && !splittingActive) {
    items.push({ label: 'Split', action: () => startSplit(single.id) });
  }

  if (single) {
    const hidden = single.identity.hidden === true;
    items.push({
      label: hidden ? 'Show' : 'Hide',
      action: () =>
        executeCommand((s) =>
          updateIdentityCommand({ surface: s, measurementId: single.id, identity: { ...single.identity, hidden: !hidden } }),
        ),
    });
    // PO follow-up ("per-measurement lock") — same setMeasurementLocked action the Layers panel's
    // own per-row lock toggle and the Properties panel's lock button use. Multi-select has no bulk
    // Lock/Unlock item (mirrors Rename/Split — only ever makes sense for exactly one shape at a
    // time in this menu's existing convention above).
    items.push({ label: single.locked ? 'Unlock' : 'Lock', action: () => setMeasurementLocked(single.id, !single.locked) });
  }

  items.push({
    label: count > 1 ? `Delete (${count})` : 'Delete',
    action: deleteSelectedMeasurement,
    danger: true,
    disabled: single ? single.locked : false,
  });

  return items;
}

/** The Background "layer" isn't a Measurement (entities.ts) — its own, much smaller menu. */
export function buildBackgroundContextMenuItems(locked: boolean): ContextMenuItem[] {
  return [{ label: locked ? 'Unlock' : 'Lock', action: () => setImageLocked(!locked) }];
}
