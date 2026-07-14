import type { Calibration, Provenance, Shape } from './types.js';

// docs/14_DOMAIN_MODEL.md §3 — the Entity types (have identity that survives content changes),
// as opposed to types.ts's Value Objects (Shape, Calibration — replaced wholesale, no identity
// of their own). Still pure Core data: no behavior, no I/O. Needed by the Application layer
// (commands, repositories) to operate on anything richer than a bare Shape.

export type MeasurementId = string;
export type LayerId = string;
export type SurfaceId = string;
export type ProjectId = string;
export type ReportId = string;

/** 14 §3 — Identity VO, embedded in Measurement; replaced wholesale on inline rename/recolor. */
export interface MeasurementIdentity {
  readonly name: string;
  readonly color: string;
  readonly note?: string;
}

/** 14 §2.1/§3 — Entity. `parentId` present only for Split children (PD-009); the parent
 * Measurement itself is untouched by Split (11 §2: "родителското Measurement... продължава да
 * съществува") — it is never deleted or replaced when children are added. */
export interface Measurement {
  readonly id: MeasurementId;
  readonly shape: Shape;
  readonly identity: MeasurementIdentity;
  /** immutable after creation — INV-6 (14 §4) */
  readonly provenance: Provenance;
  readonly parentId?: MeasurementId;
  readonly locked: boolean;
}

export interface Layer {
  readonly id: LayerId;
  readonly name: string;
  readonly visible: boolean;
  readonly order: number;
  readonly measurements: readonly Measurement[];
}

/** 'blank' added 2026-07-15 (UI commit 2): 15_UX_SPECIFICATION §6 W4 lists "Blank canvas" as a
 * third Start affordance alongside Map/Import, but the original three-value enum under-modeled
 * it — a blank Surface has no backing raster/geo source at all, distinct from an 'image' Surface
 * with a not-yet-loaded blob. Disclosed Core correction, not a new product capability (Bible/15
 * already specified "Blank canvas"; this only models what was already approved). */
export type SurfaceKind = 'image' | 'pdfPage' | 'map' | 'blank';

/** 14 §2.1 — the aggregate root. Source blob/tile reference intentionally excluded from Core:
 * that's a StorageAdapter/MapProvider (Adapters-layer) concern (21 §5.2/§8.1), not domain data
 * Core needs to know about. */
export interface Surface {
  readonly id: SurfaceId;
  readonly kind: SurfaceKind;
  readonly calibration: Calibration;
  readonly layers: readonly Layer[];
}

export interface ReportSnapshotEntry {
  readonly measurementId: MeasurementId;
  readonly name: string;
  readonly area?: number;
  readonly perimeter?: number;
  readonly unit: string;
  readonly provenance: Provenance;
}

/** 19 §4/INV-11 — a frozen copy of values at generation time. Never mutated after creation. */
export interface ReportSnapshot {
  readonly generatedAt: string;
  /** 12 §6.2 / 19 §5 — non-nullable by construction: a Report without a scale declaration
   * cannot be represented in this type at all. */
  readonly scaleDeclaration: string;
  readonly entries: readonly ReportSnapshotEntry[];
}

export interface Report {
  readonly id: ReportId;
  readonly projectId: ProjectId;
  readonly templateId: string;
  readonly lastSnapshot?: ReportSnapshot;
}

/** 14 §2.2 — Project is a "плитък" (shallow) aggregate: Surfaces are referenced by ID, never
 * embedded, because they are a separate transactional boundary (21 §2.1/§2.2). */
export interface Project {
  readonly id: ProjectId;
  readonly name: string;
  readonly workspaceId: string;
  readonly surfaceIds: readonly SurfaceId[];
  readonly reportIds: readonly ReportId[];
}
