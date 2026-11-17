import type { MeasurementId, SurfaceId } from '../core/domain/entities.js';
import type { Provenance } from '../core/domain/types.js';

// docs/14_DOMAIN_MODEL.md §5 — the domain event vocabulary. 14 §5 deliberately left the Undo
// *mechanism* open (ADR-001 resolved that: Command Stack, not Event Sourcing) but the event
// *vocabulary* itself is part of the domain model — this is a minimal, synchronous publish
// mechanism for it, scoped to the events the 8 required commands actually emit today.
//
// GhostProposed/GhostRejected are intentionally NOT part of this union: INV-5 (14 §4) requires
// they never reach any persisted store, and a published event is exactly the kind of side
// channel that could leak them there by accident — so they simply have no representation here.
// SurfaceImported/ReportGenerated/ProjectArchived/ProjectDeleted belong to commands outside
// today's scope (Import/Export, Project lifecycle) — deferred, not modeled yet.

export type DomainEvent =
  | { readonly type: 'SurfaceCalibrated'; readonly surfaceId: SurfaceId }
  | {
      readonly type: 'MeasurementDrawn';
      readonly surfaceId: SurfaceId;
      readonly measurementId: MeasurementId;
      readonly provenance: Provenance;
    }
  | { readonly type: 'MeasurementShapeEdited'; readonly surfaceId: SurfaceId; readonly measurementId: MeasurementId }
  | { readonly type: 'MeasurementIdentityUpdated'; readonly surfaceId: SurfaceId; readonly measurementId: MeasurementId }
  | {
      readonly type: 'MeasurementSplit';
      readonly surfaceId: SurfaceId;
      readonly parentId: MeasurementId;
      readonly childIds: readonly [MeasurementId, MeasurementId];
    }
  | { readonly type: 'MeasurementDeleted'; readonly surfaceId: SurfaceId; readonly measurementId: MeasurementId }
  | { readonly type: 'MeasurementsReordered'; readonly surfaceId: SurfaceId }
  | { readonly type: 'MeasurementLockToggled'; readonly surfaceId: SurfaceId; readonly measurementId: MeasurementId }
  | { readonly type: 'SurfaceImageResized'; readonly surfaceId: SurfaceId }
  | { readonly type: 'SurfaceImageLockToggled'; readonly surfaceId: SurfaceId }
  | {
      readonly type: 'MeasurementVertexLabelSet';
      readonly surfaceId: SurfaceId;
      readonly measurementId: MeasurementId;
      readonly vertexIndex: number;
    }
  | {
      readonly type: 'MeasurementVertexLabelOffsetSet';
      readonly surfaceId: SurfaceId;
      readonly measurementId: MeasurementId;
      readonly vertexIndex: number;
    }
  | {
      readonly type: 'MeasurementVertexLabelFontSizeSet';
      readonly surfaceId: SurfaceId;
      readonly measurementId: MeasurementId;
      readonly vertexIndex: number;
    }
  | { readonly type: 'MeasurementManualAreaSet'; readonly surfaceId: SurfaceId; readonly measurementId: MeasurementId }
  | { readonly type: 'MeasurementLabelMoved'; readonly surfaceId: SurfaceId; readonly measurementId: MeasurementId }
  | {
      readonly type: 'MeasurementSplitIntoParts';
      readonly surfaceId: SurfaceId;
      readonly parentId: MeasurementId;
      readonly childIds: readonly MeasurementId[];
    };

export type DomainEventListener = (event: DomainEvent) => void;

export class DomainEventBus {
  private readonly listeners: DomainEventListener[] = [];

  subscribe(listener: DomainEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  publish(event: DomainEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
