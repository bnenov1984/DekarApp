// docs/23_API.md §4 / ADR-004 — the low-level blob/structured-data primitive. A port, not an
// implementation: no IndexedDB (or any other backing store) type appears here, by the same
// construction rule as ProjectRepository/SurfaceRepository (projectRepository.ts). Repositories
// use their own dedicated IndexedDB object stores for structured aggregate data (native
// getAll()/cursors for ProjectRepository.list()) — this adapter is reserved for blob storage
// (11 §7: "изходният файл е атрибут на Surface... blob през StorageAdapter"), not a generic
// substrate every repository must route through.

export type StructuredData = Record<string, unknown>;

export type StorageOp =
  | { readonly type: 'write'; readonly key: string; readonly value: Blob | StructuredData }
  | { readonly type: 'delete'; readonly key: string };

export interface StorageAdapter {
  read(key: string): Promise<Blob | StructuredData | null>;
  write(key: string, value: Blob | StructuredData): Promise<void>;
  /** atomic — ADR-004: "StorageAdapter.transaction() maps directly to IndexedDB transactions." */
  transaction(ops: readonly StorageOp[]): Promise<void>;
}
