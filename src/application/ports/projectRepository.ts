import type { Project, ProjectId } from '../../core/domain/entities.js';

// docs/21_ARCHITECTURE.md §5.1 / docs/23_API.md §3.1 — a port, not an implementation. No
// IndexedDB/filesystem/cloud/HTTP/framework type appears anywhere in this file, by construction
// (every method signature is domain-typed in, Promise<domain-type> out) — swapping the backing
// store (ADR-004: IndexedDB today) never touches this interface or anything that depends on it.
//
// Independent-lifecycle check (Bible/11 §4): Project is created via Home Start actions, renamed,
// archived/restored, and is the one entity with a genuine delete confirmation (INV-9, 14 §4) —
// clearly its own lifecycle, clearly its own repository.

export interface ProjectSummary {
  readonly id: ProjectId;
  readonly name: string;
  /** sum of top-level Measurement areas across the Project's Surfaces — a read-model
   * projection for the Home "Recent" cards (15 §6 W4: "разпознава се по резултата си"), not a
   * field stored on Project itself. */
  readonly totalArea?: number;
  readonly updatedAt: string;
}

export interface ProjectRepository {
  get(id: ProjectId): Promise<Project | null>;
  /** autosave target (11 §6 Saved state) — called after every command settles, not just on an
   * explicit "Save" action (PD-012, D6: there is no Save button). */
  save(project: Project): Promise<void>;
  /** cascades to every Surface/Report the Project references (INV-8). The one operation without
   * an inverse (INV-9) — deliberately never wrapped in a CommandStack Command; see
   * docs/23_API.md §3.2 on why ProjectDeleteCommand doesn't implement Command<T>. */
  delete(id: ProjectId): Promise<void>;
  list(): Promise<ProjectSummary[]>;
}
