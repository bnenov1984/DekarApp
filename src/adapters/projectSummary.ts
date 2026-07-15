import type { Surface, SurfaceId } from '../core/domain/entities.js';
import type { Unit } from '../core/domain/types.js';
import { childrenOf } from '../application/surfaceOps.js';
import { compute } from '../core/measurement/measurementEngine.js';

// 15_UX_SPECIFICATION.md §6 W4 — "sum of top-level Measurement areas" for the Home Recent card.
// Shared by both ProjectRepository implementations (indexeddb + memory) so the two are
// behaviorally equivalent by construction (22_TDD.md §7), not just similarly written —
// `lookupSurface` is the only thing that differs between them.

export async function computeTotalArea(
  surfaceIds: readonly SurfaceId[],
  lookupSurface: (id: SurfaceId) => Surface | null | undefined | Promise<Surface | null | undefined>,
): Promise<{ totalArea?: number; totalAreaUnit?: Unit }> {
  let sum = 0;
  let unit: Unit | undefined;

  for (const surfaceId of surfaceIds) {
    const surface = await lookupSurface(surfaceId);
    if (!surface) continue;
    const requestedUnit: Unit = surface.calibration ? 'm2' : 'px';

    for (const layer of surface.layers) {
      for (const measurement of layer.measurements) {
        // exclude Split parents — INV-4, same double-counting rule as MeasurementList.svelte:
        // a parent's area already equals the sum of its children's.
        if (childrenOf(surface, measurement.id).length > 0) continue;
        const values = compute(measurement.shape, surface.calibration, requestedUnit);
        if (values.area !== undefined) {
          sum += values.area;
          unit = values.unit;
        }
      }
    }
  }

  return unit ? { totalArea: sum, totalAreaUnit: unit } : {};
}
