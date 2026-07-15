import type { StorageAdapter, StorageOp, StructuredData } from '../../application/ports/storageAdapter.js';

// 22_TDD.md §7 — the fake half of the StorageAdapter contract suite. Behaviorally equivalent to
// IndexedDbStorageAdapter for every assertion the shared contract makes (get/write/transaction
// round-trips); intentionally never rejects with StorageQuotaExceededError itself (there's no
// real quota to exceed) — that path is exercised separately at the call site that catches it
// (studioSession.ts), not as part of this adapter-agnostic contract.

export class InMemoryStorageAdapter implements StorageAdapter {
  private readonly store = new Map<string, Blob | StructuredData>();

  async read(key: string): Promise<Blob | StructuredData | null> {
    return this.store.get(key) ?? null;
  }

  async write(key: string, value: Blob | StructuredData): Promise<void> {
    this.store.set(key, value);
  }

  async transaction(ops: readonly StorageOp[]): Promise<void> {
    for (const op of ops) {
      if (op.type === 'write') this.store.set(op.key, op.value);
      else this.store.delete(op.key);
    }
  }
}
