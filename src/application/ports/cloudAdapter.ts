// docs/23_API.md §4/§6 / docs/21_ARCHITECTURE.md §5.3 / docs/26_ADR/ADR-005/ADR-007 — a port, not
// an implementation, same construction rule as every other file in this directory: no HTTP/fetch
// type appears here, so swapping the backend or its wire format never touches this interface or
// anything that depends on it.
//
// Deliberately generic over aggregate kind, not Surface-specific: 21 §5.3 lists "Surface saved,
// Project saved" as the two things SyncEngine observes — both are aggregate roots (14 §2) that
// get pushed/pulled through this same port.
//
// Phase 3 correction (26_ADR/ADR-007, implementing against the real 23 §6 endpoint shape
// `/v1/projects/{projectId}/surfaces/{surfaceId}`): the Phase 1 version of this port had `pull`
// take only `aggregateId` — enough for a Project ('project' kind, its own id is the whole URL),
// but not for a Surface, whose endpoint also needs its *owning* Project's id. Added `kind` to
// `pull`'s signature and `parentId` to both `pull` and `AggregateSnapshot`, undefined for
// 'project' kind, required in practice for 'surface'. Nothing implemented this port before now,
// so this is a pre-first-consumer fix, not a breaking change to real callers.

export type AggregateKind = 'project' | 'surface';

/** version + serialized aggregate tree (23 §6: "AggregateSnapshot (версия + serialized Surface
 * дърво)") — `data` is whatever JSON-serializable shape the aggregate's own repository produces
 * (Project or Surface, 14 §2), this port never inspects it, only carries it. `parentId` is the
 * owning Project's id for a 'surface' snapshot (the REST path needs both ids); absent for a
 * 'project' snapshot, which has no parent. */
export interface AggregateSnapshot<T = unknown> {
  readonly kind: AggregateKind;
  readonly aggregateId: string;
  readonly parentId?: string;
  readonly version: number;
  readonly data: T;
}

/** thrown by `push` when the server holds a newer version (23 §6: `409 Conflict { serverVersion,
 * serverSnapshot }`) — resolving it (ADR-005: last-write-wins, by timestamp) is a future
 * SyncEngine's job, not this port's; CloudAdapter only surfaces the conflict, typed, per the
 * Adapters error convention (23 §8: rejection with a typed error, not a bare throw). */
export class CloudSyncConflictError extends Error {
  constructor(
    readonly serverVersion: number,
    readonly serverSnapshot: AggregateSnapshot,
  ) {
    super('CloudAdapter.push: server holds a newer version');
    this.name = 'CloudSyncConflictError';
  }
}

/** Just enough to decide what's worth pulling — never a stand-in for `ProjectSummary`
 * (application/ports/projectRepository.ts): no `totalArea` projection, because computing that
 * needs each Surface's calibration, which this port deliberately never inspects. The local
 * `ProjectRepository` stays the source of truth for anything richer than "does this exist, and
 * which version" (PD-012 — cloud is a discovery/backup mechanism, never the critical path). */
export interface CloudProjectRef {
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly updatedAt: string;
}

export interface CloudAdapter {
  push(snapshot: AggregateSnapshot): Promise<void>;
  pull(kind: AggregateKind, aggregateId: string, sinceVersion: number, parentId?: string): Promise<AggregateSnapshot | null>;
  /** Projects owned by whoever `AuthAdapter.getSession()` currently says is signed in — the
   * "which projects can I even pull" bootstrap that push/pull-by-id alone can't answer (you can't
   * pull an aggregate whose id you don't already have). Empty when signed out, or once signed in
   * but before "Save to account" has ever pushed anything. */
  listOwnedProjects(): Promise<readonly CloudProjectRef[]>;
}
