import type { Calibration, Point, Provenance, Shape } from './types.js';

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
  /** PO follow-up (UX review, item A5 "eye icon = real visibility") — hides this Measurement
   * entirely: not drawn (sceneRenderer.ts's drawSurface), not hit-testable on canvas
   * (studioSession.ts's findMeasurementAt), and its chip/vertex-label chips don't render
   * (CanvasStage.svelte) — same "eye = object visibility" convention every layer-based tool
   * already uses, rather than a bespoke "just its label" toggle. Still fully selectable/
   * renameable/deletable from the Layers panel (D8: every canvas gesture has a list
   * counterpart, but hiding only ever removes the *canvas* one). Deliberately does NOT exclude
   * a hidden Measurement from the Layers panel's Σ Total area — it's still a real, measured
   * area, just decluttered from the current view. Toggled by the eye icon in the Layers panel,
   * lives on Identity (not a UI store) so it persists and rides the existing updateIdentityCommand
   * undo path. `undefined`/`false` both mean visible — visible is the default. */
  readonly hidden?: boolean;
}

/** PO request (per-vertex annotation) — a short label anchored to one vertex/corner/handle of a
 * Measurement's Shape, with its own font color (independent of the Measurement's own color). */
export interface VertexLabel {
  readonly text: string;
  readonly color: string;
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
  /** PO follow-up ("per-measurement lock") — 11 §"Locked" state (защита от случайна редакция —
   * protection from accidental editing): move/resize/vertex-edit/delete/split are all refused
   * while `true` (vertexEditSession.ts's enterVertexEditing, studioSession.ts's
   * deleteSelectedMeasurement, splitSession.ts's startSplit). Identity edits (rename/recolor/note/
   * hide) and Duplicate stay allowed — a duplicate is always born unlocked (createMeasurement.ts/
   * duplicateMeasurement.ts), same "the new copy doesn't inherit protection" convention as every
   * other per-instance flag on this type. Toggled via setMeasurementLockedCommand, same lock
   * icon/menu-item pattern as the Background layer's own `Surface.imageLocked`. */
  readonly locked: boolean;
  /** PO request (per-vertex annotation) — sparse, index-aligned with whichever "handle point"
   * list sceneRenderer.ts's `resizeHandlePoints`/hitTest.ts's `findHandleIndexAt` derive for this
   * Shape's type (vertex index for Polygon/Curve/Freehand; corner 0-3 for Rectangle; the single
   * radius handle, index 0, for Circle — Line has no handles, so never a target). `null` entries
   * are "no label at this index"; trailing `null`s are trimmed so this stays `undefined` whenever
   * no vertex actually has a label. Kept in sync with vertex insertion/removal by
   * addVertexCommand/removeVertexCommand (application/vertexLabels.ts) — editVertex/resize/
   * translate never change vertex count or order, so they don't need to touch this at all. */
  readonly vertexLabels?: readonly (VertexLabel | null)[];
  /** PO request (manual area) — an explicit, user-typed real-world area (m²), independent of
   * Surface.calibration: lets a parcel with a known real area be recorded even when no map/image
   * scale is (or can be) calibrated. Stored as an area-per-px² scale factor derived once, at
   * set-time, from the shape's *current* geometric px² area (`shoelaceArea`), rather than a
   * frozen absolute number — later geometry edits (drag a vertex, Split's children) recompute
   * the *displayed* area from the shape's live px² area through this same factor, so the number
   * stays proportionally accurate instead of silently going stale the moment the shape's size
   * visibly changes. For a Measurement outside a Split group the field is never touched by
   * geometry-editing commands, so "this Measurement has a manual area" survives edits — only the
   * number shown for it follows the shape.
   *
   * Split/Split-into-parts children start from the parent's factor, which is what makes "1200 m²
   * split into 3 equal parts -> ~400/400/400 m²" fall out of the geometry alone. From there,
   * **PD-021** keeps the group's areas summing to the parent's: reshaping one part rewrites every
   * part's factor so the total is conserved (application/splitGroup.ts) rather than each part
   * drifting independently. At the moment of a split the two rules agree exactly — conservation is
   * a generalisation of inheritance, not a replacement for it.
   * `undefined` = area is geometry/calibration-derived (existing behavior, unchanged) — this is
   * also the field the UI reads to know whether an area is "manual" or "calculated". */
  readonly manualArea?: { readonly squareMetersPerSquarePixel: number };
  /** PO request (draggable polygon labels) — Surface-space delta from `shapeCentroid(shape)`
   * (centroid.ts), Polygon only. `undefined` = default centroid position (unchanged prior
   * behavior). Stored as a delta rather than an absolute point so the label naturally tracks the
   * shape if it's ever moved as a whole; `labelDragSession.ts` only ever accepts a candidate
   * whose `centroid + delta` lands inside the polygon (`hitTest.ts`'s `pointInPolygon`), so this
   * field is never persisted pointing outside its own shape. */
  readonly labelOffset?: { readonly dx: number; readonly dy: number };
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
  /** PO request (resizable imported image) — only meaningful when `kind === 'image'`. Undefined
   * until the user first resizes it, at which point `effectiveImageRect`'s (imageResizeSession.ts)
   * native-bitmap-size default stops applying and this becomes the explicit, persisted rect — a
   * fixed Surface-space value either way (ISS-010 fix: no longer re-derived from the live
   * container box size). Deliberately shaped like a Rectangle Measurement's geometry (rotation
   * fixed at 0, same as Rectangle's own current scope line) so the already-tested
   * `resizeRectangleCorner`/`findRectangleCornerAt` apply unchanged rather than duplicating that
   * math for a second shape kind. */
  readonly imageRect?: { readonly origin: Point; readonly width: number; readonly height: number };
  /** PO request (lockable Background layer, Photoshop-style) — `undefined` and `true` both mean
   * locked (locked is the safe default: a freshly-imported image is locked until the user
   * explicitly unlocks it, so it can't be nudged out of place while drawing measurements over
   * it). Only `false` means unlocked — resizable/movable. */
  readonly imageLocked?: boolean;
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
  /** Phase 3 of the SaaS migration (26_ADR/ADR-007) — `undefined` for every project that has
   * never been pushed to an account (PD-012: local-first, no account required — this is the
   * literal type-level expression of that). Set once, by the server, on the first successful
   * `PUT /v1/projects/{id}` (23_API.md §6) that claims ownership for the signed-in user; never
   * set by any local command. Core/Application never branch on *who* this is (no permission
   * logic lives here) — it is carried data, the same "domain data, not behavior" discipline as
   * every other field on this type. */
  readonly ownerId?: string;
}
