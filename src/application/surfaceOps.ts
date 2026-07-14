import type { Layer, LayerId, Measurement, MeasurementId, Surface } from '../core/domain/entities.js';

// Pure Application-layer orchestration: restructures the Surface entity tree (immutably —
// arrays/objects replaced, never mutated in place, same VO discipline as Core, 14 §3). No
// geometric math and no rendering here — geometry always comes pre-computed from a Core engine
// call in the calling Command; these functions only know how to splice a Measurement into/out
// of the right Layer.

function updateLayer(surface: Surface, layerId: LayerId, fn: (layer: Layer) => Layer): Surface {
  return { ...surface, layers: surface.layers.map((l) => (l.id === layerId ? fn(l) : l)) };
}

export function addMeasurement(surface: Surface, layerId: LayerId, measurement: Measurement): Surface {
  return updateLayer(surface, layerId, (layer) => ({
    ...layer,
    measurements: [...layer.measurements, measurement],
  }));
}

export interface FoundMeasurement {
  readonly layerId: LayerId;
  readonly measurement: Measurement;
}

export function findMeasurement(surface: Surface, id: MeasurementId): FoundMeasurement | null {
  for (const layer of surface.layers) {
    const measurement = layer.measurements.find((m) => m.id === id);
    if (measurement) return { layerId: layer.id, measurement };
  }
  return null;
}

export function replaceMeasurement(surface: Surface, id: MeasurementId, next: Measurement): Surface {
  const found = findMeasurement(surface, id);
  if (!found) throw new Error(`replaceMeasurement: measurement '${id}' not found`);
  return updateLayer(surface, found.layerId, (layer) => ({
    ...layer,
    measurements: layer.measurements.map((m) => (m.id === id ? next : m)),
  }));
}

export function removeMeasurements(surface: Surface, ids: readonly MeasurementId[]): Surface {
  const idSet = new Set(ids);
  return {
    ...surface,
    layers: surface.layers.map((layer) => ({
      ...layer,
      measurements: layer.measurements.filter((m) => !idSet.has(m.id)),
    })),
  };
}

function withoutParent(measurement: Measurement): Measurement {
  const { parentId: _parentId, ...rest } = measurement;
  return rest;
}

/** 11 §4 — deleting a split child dissolves the group for its remaining siblings: they lose
 * `parentId` and become ordinary measurements. The parent measurement itself is untouched. */
export function dissolveSplitGroup(surface: Surface, parentId: MeasurementId): Surface {
  return {
    ...surface,
    layers: surface.layers.map((layer) => ({
      ...layer,
      measurements: layer.measurements.map((m) => (m.parentId === parentId ? withoutParent(m) : m)),
    })),
  };
}

export function childrenOf(surface: Surface, parentId: MeasurementId): Measurement[] {
  return surface.layers.flatMap((l) => l.measurements.filter((m) => m.parentId === parentId));
}
