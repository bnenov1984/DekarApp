import { describe, expect, it } from 'vitest';
import type { CloudAdapter } from '../application/ports/cloudAdapter.js';
import { CloudSyncConflictError } from '../application/ports/cloudAdapter.js';

// docs/22_TDD.md §7 — one contract suite, meant to run against every CloudAdapter
// implementation. Today only one exists to run it against: the in-memory fake
// (memory/cloudAdapter.ts). The real implementation (adapters/http/cloudAdapter.ts) talks to a
// live areaflow-api + Postgres (docs/26_ADR/ADR-007) that doesn't exist in this test
// environment — same position AuthAdapter's contract suite is in (authAdapter.contract.ts) and
// IndexedDB's was in before ISS-008. Verified instead by hand against the real backend (curl +
// browser) while building it — see the Phase 3 commit.

export function runCloudAdapterContractTests(makeAdapter: () => CloudAdapter): void {
  describe('CloudAdapter contract', () => {
    it('pull returns null for an aggregate that was never pushed', async () => {
      const cloud = makeAdapter();
      expect(await cloud.pull('project', 'nonexistent', 0)).toBeNull();
    });

    it('push then pull round-trips a project snapshot', async () => {
      const cloud = makeAdapter();
      await cloud.push({ kind: 'project', aggregateId: 'p1', version: 1, data: { name: 'Parcel A' } });
      const pulled = await cloud.pull('project', 'p1', 0);
      expect(pulled).toEqual({ kind: 'project', aggregateId: 'p1', version: 1, data: { name: 'Parcel A' } });
    });

    it('push then pull round-trips a surface snapshot, scoped by parentId', async () => {
      const cloud = makeAdapter();
      await cloud.push({ kind: 'surface', aggregateId: 's1', parentId: 'p1', version: 1, data: { layers: [] } });
      expect(await cloud.pull('surface', 's1', 0, 'p1')).toEqual({
        kind: 'surface',
        aggregateId: 's1',
        parentId: 'p1',
        version: 1,
        data: { layers: [] },
      });
      // same aggregateId under a different parent is a different aggregate entirely
      expect(await cloud.pull('surface', 's1', 0, 'p2')).toBeNull();
    });

    it('pull returns null when sinceVersion is already current', async () => {
      const cloud = makeAdapter();
      await cloud.push({ kind: 'project', aggregateId: 'p1', version: 3, data: {} });
      expect(await cloud.pull('project', 'p1', 3, undefined)).toBeNull();
      expect(await cloud.pull('project', 'p1', 2, undefined)).not.toBeNull();
    });

    it('push accepts a strictly newer version, overwriting the stored snapshot', async () => {
      const cloud = makeAdapter();
      await cloud.push({ kind: 'project', aggregateId: 'p1', version: 1, data: { name: 'v1' } });
      await cloud.push({ kind: 'project', aggregateId: 'p1', version: 2, data: { name: 'v2' } });
      expect(await cloud.pull('project', 'p1', 0)).toEqual({ kind: 'project', aggregateId: 'p1', version: 2, data: { name: 'v2' } });
    });

    it('push rejects a version that is not strictly newer than what is stored', async () => {
      const cloud = makeAdapter();
      await cloud.push({ kind: 'project', aggregateId: 'p1', version: 2, data: { name: 'current' } });
      await expect(cloud.push({ kind: 'project', aggregateId: 'p1', version: 2, data: { name: 'stale' } })).rejects.toBeInstanceOf(
        CloudSyncConflictError,
      );
      await expect(cloud.push({ kind: 'project', aggregateId: 'p1', version: 1, data: { name: 'older' } })).rejects.toBeInstanceOf(
        CloudSyncConflictError,
      );
    });

    it('listOwnedProjects lists every pushed project, not surfaces', async () => {
      const cloud = makeAdapter();
      await cloud.push({ kind: 'project', aggregateId: 'p1', version: 1, data: { name: 'Parcel A' } });
      await cloud.push({ kind: 'project', aggregateId: 'p2', version: 1, data: { name: 'Parcel B' } });
      await cloud.push({ kind: 'surface', aggregateId: 's1', parentId: 'p1', version: 1, data: {} });

      const refs = await cloud.listOwnedProjects();
      expect(refs.map((ref) => ref.id).sort()).toEqual(['p1', 'p2']);
      expect(refs.find((ref) => ref.id === 'p1')?.name).toBe('Parcel A');
    });
  });
}
