import type { Project, ProjectId, Surface } from '../../core/domain/entities.js';
import type { ProjectRepository, ProjectSummary } from '../../application/ports/projectRepository.js';
import { computeTotalArea } from '../projectSummary.js';
import { openDatabase, getRecord, getAllRecords, putRecord, deleteRecords, PROJECTS_STORE, SURFACES_STORE } from './database.js';

// docs/23_API.md §3.1 / ADR-004 — the real ProjectRepository. `delete` cascades to every Surface
// the Project references (INV-8, 14 §4) in the same IndexedDB transaction as the Project's own
// removal — a Surface never survives its owning Project's delete.

/** Stored representation carries `updatedAt` bookkeeping the domain `Project` type itself has no
 * field for (autosave timestamp, PD-012 D6) — stripped back off in `get()`. */
interface StoredProject extends Project {
  readonly updatedAt: string;
}

export class IndexedDbProjectRepository implements ProjectRepository {
  constructor(private readonly dbName?: string) {}

  private db(): Promise<IDBDatabase> {
    return openDatabase(this.dbName);
  }

  async get(id: ProjectId): Promise<Project | null> {
    const db = await this.db();
    const stored = await getRecord<StoredProject>(db, PROJECTS_STORE, id);
    if (!stored) return null;
    const { updatedAt: _updatedAt, ...project } = stored;
    return project;
  }

  async save(project: Project): Promise<void> {
    const db = await this.db();
    const stored: StoredProject = { ...project, updatedAt: new Date().toISOString() };
    await putRecord(db, PROJECTS_STORE, stored);
  }

  /** INV-8 cascade — deletes every Surface the Project references, in the same operation. */
  async delete(id: ProjectId): Promise<void> {
    const db = await this.db();
    const project = await this.get(id);
    const surfaceIds = project?.surfaceIds ?? [];
    await Promise.all([deleteRecords(db, PROJECTS_STORE, [id]), deleteRecords(db, SURFACES_STORE, surfaceIds)]);
  }

  async list(): Promise<ProjectSummary[]> {
    const db = await this.db();
    const stored = await getAllRecords<StoredProject>(db, PROJECTS_STORE);

    const summaries = await Promise.all(
      stored.map(async (p): Promise<ProjectSummary> => {
        const summary = await computeTotalArea(p.surfaceIds, (id) => getRecord<Surface>(db, SURFACES_STORE, id));
        return { id: p.id, name: p.name, ...summary, updatedAt: p.updatedAt };
      }),
    );
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}
