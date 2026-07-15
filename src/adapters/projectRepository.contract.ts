import { describe, expect, it } from 'vitest';
import type { ProjectRepository } from '../application/ports/projectRepository.js';
import type { SurfaceRepository } from '../application/ports/surfaceRepository.js';
import type { Project, Surface } from '../core/domain/entities.js';

// docs/22_TDD.md §7 — one contract suite, run against both the fake (memory/projectRepository.ts)
// and the real (indexeddb/projectRepository.ts) implementations. Takes a paired SurfaceRepository
// (same backing store) so INV-8 cascade delete can be verified end to end, and so the
// `list()`/totalArea projection has Surfaces to read.

function project(id: string, surfaceIds: readonly string[] = []): Project {
  return { id, name: `Project ${id}`, workspaceId: 'general', surfaceIds, reportIds: [] };
}

function squareSurface(id: string): Surface {
  return {
    id,
    kind: 'blank',
    calibration: null,
    layers: [
      {
        id: `${id}-layer`,
        name: 'Default',
        visible: true,
        order: 0,
        measurements: [
          {
            id: `${id}-m1`,
            shape: { type: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
            identity: { name: 'Square', color: '#2E7D32' },
            provenance: 'Manual',
            locked: false,
          },
        ],
      },
    ],
  };
}

export function runProjectRepositoryContractTests(
  make: () => { projects: ProjectRepository; surfaces: SurfaceRepository } | Promise<{ projects: ProjectRepository; surfaces: SurfaceRepository }>,
): void {
  describe('ProjectRepository contract', () => {
    it('get returns null for a missing id', async () => {
      const { projects } = await make();
      expect(await projects.get('missing')).toBeNull();
    });

    it('save then get round-trips the Project (domain fields only, no bookkeeping leak)', async () => {
      const { projects } = await make();
      const p = project('p1');
      await projects.save(p);
      expect(await projects.get('p1')).toEqual(p);
    });

    it('delete cascades to every referenced Surface (INV-8)', async () => {
      const { projects, surfaces } = await make();
      await surfaces.save(squareSurface('s1'));
      await projects.save(project('p2', ['s1']));

      await projects.delete('p2');

      expect(await projects.get('p2')).toBeNull();
      expect(await surfaces.get('s1')).toBeNull(); // cascaded — a Surface never survives its Project
    });

    it('list reflects the sum of top-level Measurement areas (15 W4), excluding Split parents', async () => {
      const { projects, surfaces } = await make();
      await surfaces.save(squareSurface('s2'));
      await projects.save(project('p3', ['s2']));

      const summaries = await projects.list();
      const summary = summaries.find((s) => s.id === 'p3')!;
      expect(summary.totalArea).toBeCloseTo(100, 8);
      expect(summary.totalAreaUnit).toBe('px');
    });

    it('list returns projects sorted most-recently-updated first', async () => {
      const { projects } = await make();
      await projects.save(project('older'));
      await new Promise((resolve) => setTimeout(resolve, 5));
      await projects.save(project('newer'));

      const summaries = await projects.list();
      const ids = summaries.map((s) => s.id);
      expect(ids.indexOf('newer')).toBeLessThan(ids.indexOf('older'));
    });
  });
}
