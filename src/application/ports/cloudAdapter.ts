// docs/23_API.md §4 / docs/21_ARCHITECTURE.md §5.3 / docs/26_ADR/ADR-005 — a port, not an
// implementation, same construction rule as every other file in this directory: no HTTP/fetch
// type appears here, so swapping the backend (ADR-007) or its wire format never touches this
// interface or anything that depends on it. Phase 1 of the SaaS migration (ADR-007) — this file
// defines the contract only; nothing implements or calls it yet, so it carries zero regression
// risk for the existing local-only IndexedDB path.
//
// Deliberately generic over aggregate kind, not Surface-specific: 21 §5.3 lists "Surface saved,
// Project saved" as the two things SyncEngine observes — both are aggregate roots (14 §2) that
// get pushed/pulled through this same port.

export type AggregateKind = 'project' | 'surface';

/** version + serialized aggregate tree (23 §6: "AggregateSnapshot (версия + serialized Surface
 * дърво)") — `data` is whatever JSON-serializable shape the aggregate's own repository produces
 * (Project or Surface, 14 §2), this port never inspects it, only carries it. */
export interface AggregateSnapshot<T = unknown> {
  readonly kind: AggregateKind;
  readonly aggregateId: string;
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

export interface CloudAdapter {
  push(snapshot: AggregateSnapshot): Promise<void>;
  pull(aggregateId: string, sinceVersion: number): Promise<AggregateSnapshot | null>;
}
