import type { AggregateSnapshot, CloudAdapter, CloudProjectRef } from '../../application/ports/cloudAdapter.js';
import { CloudSyncConflictError } from '../../application/ports/cloudAdapter.js';

// docs/22_TDD.md §7 — the fake for CloudAdapter's contract suite (../cloudAdapter.contract.ts).
// Simulates a tiny single-user "cloud" entirely in memory: one Map per aggregate kind, keyed by
// `${parentId ?? ''}/${aggregateId}` so a Surface's id (unique only within its Project) can't
// collide with another Project's Surface of the same id — same shape the real backend's
// composite lookup (projectId + surfaceId) needs, without a database. No ownership/session model
// here at all: HttpCloudAdapter's 401/403 paths are a real-backend-only concern (areaflow-api's
// requireSession + ownership check), not something this port's contract requires of every
// implementation — the fake is intentionally always "the one signed-in user".

export class InMemoryCloudAdapter implements CloudAdapter {
  private readonly store = new Map<string, AggregateSnapshot>();

  private key(kind: string, aggregateId: string, parentId?: string): string {
    return `${kind}:${parentId ?? ''}/${aggregateId}`;
  }

  async push(snapshot: AggregateSnapshot): Promise<void> {
    const key = this.key(snapshot.kind, snapshot.aggregateId, snapshot.parentId);
    const existing = this.store.get(key);
    if (existing && snapshot.version <= existing.version) {
      throw new CloudSyncConflictError(existing.version, existing);
    }
    this.store.set(key, snapshot);
  }

  async pull(kind: AggregateSnapshot['kind'], aggregateId: string, sinceVersion: number, parentId?: string): Promise<AggregateSnapshot | null> {
    const snapshot = this.store.get(this.key(kind, aggregateId, parentId));
    if (!snapshot || snapshot.version <= sinceVersion) return null;
    return snapshot;
  }

  async listOwnedProjects(): Promise<readonly CloudProjectRef[]> {
    return [...this.store.values()]
      .filter((snapshot): snapshot is AggregateSnapshot<{ name: string }> => snapshot.kind === 'project')
      .map((snapshot) => ({
        id: snapshot.aggregateId,
        version: snapshot.version,
        name: snapshot.data.name,
        updatedAt: new Date().toISOString(),
      }));
  }
}
