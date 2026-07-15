import type { Surface, SurfaceId } from '../../core/domain/entities.js';
import type { SurfaceRepository } from '../../application/ports/surfaceRepository.js';

// 22_TDD.md §7 — behaviorally equivalent to IndexedDbSurfaceRepository for the shared contract
// suite. A JS Map assignment is trivially atomic (single-threaded), matching INV-3's requirement
// without needing to simulate a transaction.
export class InMemorySurfaceRepository implements SurfaceRepository {
  private readonly store = new Map<SurfaceId, Surface>();

  async get(id: SurfaceId): Promise<Surface | null> {
    return this.store.get(id) ?? null;
  }

  async save(surface: Surface): Promise<void> {
    this.store.set(surface.id, surface);
  }

  async delete(id: SurfaceId): Promise<void> {
    this.store.delete(id);
  }
}
