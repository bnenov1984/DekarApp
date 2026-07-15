import { describe, expect, it } from 'vitest';
import type { SurfaceRepository } from '../application/ports/surfaceRepository.js';
import type { Surface } from '../core/domain/entities.js';

// docs/22_TDD.md §7 — one contract suite, run against both the fake (memory/surfaceRepository.ts)
// and the real (indexeddb/surfaceRepository.ts) implementations.

function blankSurface(id: string): Surface {
  return {
    id,
    kind: 'blank',
    calibration: null,
    layers: [{ id: `${id}-layer`, name: 'Default', visible: true, order: 0, measurements: [] }],
  };
}

export function runSurfaceRepositoryContractTests(makeRepo: () => SurfaceRepository | Promise<SurfaceRepository>): void {
  describe('SurfaceRepository contract', () => {
    it('get returns null for a missing id', async () => {
      const repo = await makeRepo();
      expect(await repo.get('missing')).toBeNull();
    });

    it('save then get round-trips the full aggregate tree', async () => {
      const repo = await makeRepo();
      const surface = blankSurface('s1');
      await repo.save(surface);
      expect(await repo.get('s1')).toEqual(surface);
    });

    it('save overwrites an existing Surface atomically (INV-3 — never observed half-applied)', async () => {
      const repo = await makeRepo();
      await repo.save(blankSurface('s2'));
      const recalibrated: Surface = { ...blankSurface('s2'), calibration: { kind: 'linear', metersPerPixel: 0.05 } };
      await repo.save(recalibrated);
      expect(await repo.get('s2')).toEqual(recalibrated);
    });

    it('delete removes the Surface', async () => {
      const repo = await makeRepo();
      await repo.save(blankSurface('s3'));
      await repo.delete('s3');
      expect(await repo.get('s3')).toBeNull();
    });
  });
}
