import type { ProjectId, Report, ReportId } from '../../core/domain/entities.js';

// Independent-lifecycle check: a Report's snapshot is generated on demand and is immutable once
// created (INV-11, 14 §4/§7) — an append-only operation shape, structurally different from
// Project's CRUD-with-mutation lifecycle. That's a real justification for a separate port, not
// a mechanical one-repository-per-entity habit.
//
// Note: docs/19_IMPORT_EXPORT.md §4 describes Report storage as "част от ProjectRepository" —
// that line was about *physical co-location* (where the bytes live), which can still be true
// under ADR-004 (same IndexedDB database) even though the *port* the Application layer programs
// against is this separate interface. Worth a follow-up edit to 19 §4 to make that distinction
// explicit rather than reading as a contradiction — flagged in this task's report, not resolved
// silently here (PD-020: no quiet edits to the frozen corpus).

export interface ReportRepository {
  get(id: ReportId): Promise<Report | null>;
  listByProject(projectId: ProjectId): Promise<Report[]>;
  /** always a full Report value carrying a freshly-generated ReportSnapshot (INV-11) — there is
   * no partial-update method here, because "mutate an existing snapshot" is not a legal
   * operation on this port. */
  save(report: Report): Promise<void>;
  delete(id: ReportId): Promise<void>;
}
