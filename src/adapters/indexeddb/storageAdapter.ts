import type { StorageAdapter, StorageOp, StructuredData } from '../../application/ports/storageAdapter.js';
import { StorageQuotaExceededError } from '../errors.js';
import { openDatabase, BLOBS_STORE } from './database.js';

// docs/23_API.md §4 / ADR-004 — the real StorageAdapter. Blob storage only (see the port's own
// header comment for why structured aggregate data doesn't route through this) — not wired to
// any UI yet (no Image/PDF import exists), but this is the "first real StorageAdapter
// implementation" ISS-008 (docs/27_NOTES/PHASE_4_IMPLEMENTATION_ISSUES.md) names as its own
// validation trigger.

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'QuotaExceededError' || error.code === 22);
}

export class IndexedDbStorageAdapter implements StorageAdapter {
  constructor(private readonly dbName?: string) {}

  private db(): Promise<IDBDatabase> {
    return openDatabase(this.dbName);
  }

  async read(key: string): Promise<Blob | StructuredData | null> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const request = db.transaction(BLOBS_STORE, 'readonly').objectStore(BLOBS_STORE).get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async write(key: string, value: Blob | StructuredData): Promise<void> {
    return this.transaction([{ type: 'write', key, value }]);
  }

  /** 23 §4 — atomic: every op in `ops` lands in the same IndexedDB transaction, so either all of
   * them are visible on the next read or none are (`tx.onerror` aborts the whole transaction). */
  async transaction(ops: readonly StorageOp[]): Promise<void> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BLOBS_STORE, 'readwrite');
      const store = tx.objectStore(BLOBS_STORE);
      for (const op of ops) {
        if (op.type === 'write') store.put(op.value, op.key);
        else store.delete(op.key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(isQuotaError(tx.error) ? new StorageQuotaExceededError() : tx.error);
    });
  }
}
