import { StorageQuotaExceededError } from '../errors.js';

// docs/26_ADR/ADR-004-indexeddb-local-storage.md — the one shared connection helper (+ small
// single-store CRUD primitives) for every IndexedDB-backed adapter in this directory. `dbName`
// is overridable so contract tests get an isolated database instead of sharing the app's real
// one. `storageAdapter.ts` keeps its own bespoke `transaction()` (mixed write/delete ops in one
// atomic call, per its own contract) rather than using `putRecord`/`deleteRecords` below — those
// two are single-store, single-op-kind helpers, a good fit for the repositories' simpler needs,
// not a fit for storageAdapter's mixed-ops contract.

const DEFAULT_DB_NAME = 'areaflow';
// PO request (unit preference persistence) — bumped 1 -> 2 to add SETTINGS_STORE. Explicit,
// documented migration (not a silent reinterpretation of old data): `onupgradeneeded` only ever
// *adds* a missing store, so every existing PROJECTS_STORE/SURFACES_STORE/BLOBS_STORE record for
// a user upgrading from v1 is left completely untouched — existing saved projects keep loading
// exactly as before. A first read of the new store legitimately finds nothing (see
// IndexedDbSettingsRepository.get()'s `?? DEFAULT_APP_SETTINGS` fallback) — that's the expected
// post-migration state, not a data-loss bug.
const DB_VERSION = 2;

export const PROJECTS_STORE = 'projects';
export const SURFACES_STORE = 'surfaces';
export const BLOBS_STORE = 'blobs';
export const SETTINGS_STORE = 'settings';

export function openDatabase(dbName: string = DEFAULT_DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SURFACES_STORE)) db.createObjectStore(SURFACES_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(BLOBS_STORE)) db.createObjectStore(BLOBS_STORE);
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) db.createObjectStore(SETTINGS_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'QuotaExceededError' || error.code === 22);
}

export function getRecord<T>(db: IDBDatabase, storeName: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function getAllRecords<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** `key` is only needed for a no-keyPath store (SETTINGS_STORE/BLOBS_STORE convention) — omitted
 * for PROJECTS_STORE/SURFACES_STORE, whose records carry their own `id` keyPath. */
export function putRecord(db: IDBDatabase, storeName: string, value: unknown, key?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    if (key !== undefined) store.put(value, key);
    else store.put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(isQuotaError(tx.error) ? new StorageQuotaExceededError() : tx.error);
  });
}

export function deleteRecords(db: IDBDatabase, storeName: string, keys: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const key of keys) store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
