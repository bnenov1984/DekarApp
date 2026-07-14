import type { Surface, SurfaceId } from '../../core/domain/entities.js';

// docs/21_ARCHITECTURE.md §2.1/§5.1 — kept separate from ProjectRepository *on purpose*, not
// mechanically: Surface is the transactional consistency boundary (recalibration must
// atomically recompute-on-read for every Measurement on that one Surface, independent of
// anything else in the Project — 14 §2.1, INV-3). That is a different aggregate root than
// Project, so it gets its own port. Not in the task's example list, but justified by the
// already-reviewed architecture, not new scope.

export interface SurfaceRepository {
  /** the whole aggregate tree: calibration + layers + measurements + shapes (21 §5.1) */
  get(id: SurfaceId): Promise<Surface | null>;
  /** atomic — INV-3: a save can never be observed half-applied (some Measurements reflecting
   * the new Calibration, others not). */
  save(surface: Surface): Promise<void>;
  /** cascades to Layers/Measurements/Shapes (INV-8) */
  delete(id: SurfaceId): Promise<void>;
}
