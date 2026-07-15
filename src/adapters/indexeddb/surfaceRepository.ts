import type { Surface, SurfaceId } from '../../core/domain/entities.js';
import type { SurfaceRepository } from '../../application/ports/surfaceRepository.js';
import { openDatabase, getRecord, putRecord, deleteRecords, SURFACES_STORE } from './database.js';

// docs/23_API.md §3.1 / ADR-004 — the real SurfaceRepository. `save` is atomic (INV-3: a save can
// never be observed half-applied) — `putRecord` writes the whole aggregate tree (calibration +
// layers + measurements + shapes) in a single IndexedDB transaction, so every reader either sees
// the old Surface or the fully-new one, never a partial mix.

export class IndexedDbSurfaceRepository implements SurfaceRepository {
  constructor(private readonly dbName?: string) {}

  private db(): Promise<IDBDatabase> {
    return openDatabase(this.dbName);
  }

  async get(id: SurfaceId): Promise<Surface | null> {
    const db = await this.db();
    const surface = await getRecord<Surface>(db, SURFACES_STORE, id);
    return surface ?? null;
  }

  async save(surface: Surface): Promise<void> {
    const db = await this.db();
    await putRecord(db, SURFACES_STORE, surface);
  }

  async delete(id: SurfaceId): Promise<void> {
    const db = await this.db();
    await deleteRecords(db, SURFACES_STORE, [id]);
  }
}
