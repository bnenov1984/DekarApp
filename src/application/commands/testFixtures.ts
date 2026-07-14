import type { Layer, Measurement, Surface } from '../../core/domain/entities.js';

// Shared test fixtures — deliberately zero random/time-based fields (no auto-generated ids, no
// timestamps) so every comparison in the round-trip tests can use plain `toEqual` as domain
// equality, per the task's requirement to avoid snapshotting incidental runtime fields.

export function makeSquareMeasurement(id: string, offsetX = 0): Measurement {
  return {
    id,
    shape: {
      type: 'polygon',
      vertices: [
        { x: 0 + offsetX, y: 0 },
        { x: 10 + offsetX, y: 0 },
        { x: 10 + offsetX, y: 10 },
        { x: 0 + offsetX, y: 10 },
      ],
    },
    identity: { name: 'Square', color: '#2E7D32' },
    provenance: 'Manual',
    locked: false,
  };
}

export function makeTestSurface(measurements: Measurement[] = [makeSquareMeasurement('m1')]): Surface {
  const layer: Layer = { id: 'layer1', name: 'Default', visible: true, order: 0, measurements };
  return { id: 'surface1', kind: 'image', calibration: null, layers: [layer] };
}
