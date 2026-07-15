import type { Project, ProjectId } from '../../core/domain/entities.js';
import type { ProjectRepository, ProjectSummary } from '../../application/ports/projectRepository.js';
import { computeTotalArea } from '../projectSummary.js';
import type { InMemorySurfaceRepository } from './surfaceRepository.js';

interface StoredProject extends Project {
  readonly updatedAt: string;
}

// 22_TDD.md §7 — behaviorally equivalent to IndexedDbProjectRepository for the shared contract
// suite. Takes the fake SurfaceRepository as a constructor dependency (not a real one) purely to
// resolve `surfaceIds` for the same total-area summary computation the real one does — mirrors
// how the real one reads the sibling `surfaces` IndexedDB object store directly.
export class InMemoryProjectRepository implements ProjectRepository {
  private readonly store = new Map<ProjectId, StoredProject>();

  constructor(private readonly surfaces: InMemorySurfaceRepository) {}

  async get(id: ProjectId): Promise<Project | null> {
    const stored = this.store.get(id);
    if (!stored) return null;
    const { updatedAt: _updatedAt, ...project } = stored;
    return project;
  }

  async save(project: Project): Promise<void> {
    this.store.set(project.id, { ...project, updatedAt: new Date().toISOString() });
  }

  async delete(id: ProjectId): Promise<void> {
    const project = await this.get(id);
    this.store.delete(id);
    if (project) {
      await Promise.all(project.surfaceIds.map((surfaceId) => this.surfaces.delete(surfaceId)));
    }
  }

  async list(): Promise<ProjectSummary[]> {
    const summaries = await Promise.all(
      [...this.store.values()].map(async (p): Promise<ProjectSummary> => {
        const summary = await computeTotalArea(p.surfaceIds, (id) => this.surfaces.get(id));
        return { id: p.id, name: p.name, ...summary, updatedAt: p.updatedAt };
      }),
    );
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}
