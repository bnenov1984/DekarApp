import type { Measurement, MeasurementId, Surface } from '../core/domain/entities.js';
import { shoelaceArea } from '../core/measurement/formulas.js';
import { childrenOf, findMeasurement, replaceMeasurement } from './surfaceOps.js';

// PD-021 — Manual Area след Split: запазена сума. The parts of a split parcel divide a *fixed*
// total rather than each drifting independently: reshaping one part redistributes area between the
// parts, so the group always sums to the parent's own area. Before PD-021 each child simply
// inherited the parent's factor verbatim and kept it forever, so any later edit inflated or
// deflated the group's sum (the reported bug: 1200 m² split in two, drag a boundary vertex, and
// the two parts no longer add up to 1200).
//
// Three structural facts make this cheap, and are worth knowing before changing anything here:
//
//  1. The group needs no stored state. Split/Split-into-parts already give every child a
//     `parentId`, and PD-009 keeps the parent Measurement alive and untouched by child edits — so
//     "the parts of this split" is exactly `childrenOf(parent)`, and the conserved total is the
//     parent's own displayed area. Nothing new is persisted, so no migration.
//
//  2. Distributing the total in proportion to each part's geometric area is algebraically the same
//     as giving the whole group one shared factor: `parentArea / Σ(part geometric areas)`. At the
//     moment of a split — where the parts' geometric areas sum to the parent's by construction
//     (INV-4/INV-14) — that yields precisely the parent's own factor, which is what the old
//     inherit-verbatim behaviour produced. PD-021 is therefore a strict generalisation: identical
//     at split time, differing only after an edit.
//
//  3. Undo needs nothing special. Every Command here closes over the whole `before` Surface and
//     restores it wholesale, so a command that rebalances N siblings undoes atomically for free
//     (ADR-001 unchanged).
//
// INV-2 is deliberately preserved: the Measurement Engine's `compute()` stays a pure function of
// one shape, its calibration and its unit. Rebalancing is an explicit write-back of stored factors
// at command time, never a cross-Measurement input to the engine.

function geometricArea(measurement: Measurement): number {
  return measurement.shape.type === 'polygon' ? shoelaceArea(measurement.shape.vertices) : 0;
}

/** What this Measurement currently displays: live geometric px² through its own stored factor. */
function displayedArea(measurement: Measurement): number {
  return geometricArea(measurement) * (measurement.manualArea?.squareMetersPerSquarePixel ?? 0);
}

/** Rewrites every part of `parentId`'s group so their areas sum to the parent's displayed area.
 * A no-op unless the parent actually carries a manual area and has parts with positive geometry —
 * a zero-area group would otherwise divide by zero (same defensive convention as the rest of the
 * geometry code). */
function rebalanceChildren(surface: Surface, parentId: MeasurementId): Surface {
  const parent = findMeasurement(surface, parentId)?.measurement;
  if (!parent?.manualArea) return surface;

  const parts = childrenOf(surface, parentId).filter((child) => child.shape.type === 'polygon');
  if (parts.length === 0) return surface;

  const totalGeometric = parts.reduce((sum, part) => sum + geometricArea(part), 0);
  if (!(totalGeometric > 0)) return surface;

  const squareMetersPerSquarePixel = displayedArea(parent) / totalGeometric;
  return parts.reduce(
    (next, part) => replaceMeasurement(next, part.id, { ...part, manualArea: { squareMetersPerSquarePixel } }),
    surface,
  );
}

/** Rebalances `parentId`'s parts, then each of those parts' own parts, and so on — a part whose
 * factor just changed has a different displayed area, so any group it is itself the parent of must
 * divide that new total (a parcel split into parts, one of which is split again). */
function rebalanceDescendants(surface: Surface, parentId: MeasurementId): Surface {
  const rebalanced = rebalanceChildren(surface, parentId);
  return childrenOf(rebalanced, parentId).reduce((next, child) => rebalanceDescendants(next, child.id), rebalanced);
}

/**
 * Call after any command that changes a Measurement's geometry, with the id of what changed.
 *
 * Handles both directions of the relationship, because a geometry edit can break conservation
 * either way: the changed Measurement may be a *part* of a group (its siblings must give up or
 * absorb the difference) or the *parent* of one (its parts must divide the parent's new total).
 * Rigid moves need not call this — translation preserves geometric area — though doing so is
 * harmless.
 */
export function rebalanceSplitGroups(surface: Surface, changedId: MeasurementId): Surface {
  const changed = findMeasurement(surface, changedId)?.measurement;
  if (!changed) return surface;

  // As a part: rebalancing its group also re-derives the changed Measurement's own factor, so the
  // cascade below has to start from the parent to pick up every sibling's descendants too.
  if (changed.parentId !== undefined) return rebalanceDescendants(surface, changed.parentId);

  // As a parent only: its own factor is unchanged, but its displayed area moved with its geometry.
  return rebalanceDescendants(surface, changedId);
}
