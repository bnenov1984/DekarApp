import { writable } from 'svelte/store';
import type { MeasurementId } from '../../core/domain/entities.js';

// PO request (per-vertex annotation) — ephemeral UI-only state (never persisted, unlike the
// labels themselves) tracking which vertex's label the Properties panel's Notes field is
// currently editing. Double-clicking a vertex handle (CanvasStage.svelte, only reachable while
// already in vertex-edit mode — vertexEditSession.ts) activates it; PropertyPanel.svelte then
// repurposes the Notes textarea for that one vertex's label text/color instead of the
// Measurement's own note, reverting when this clears.

export interface ActiveVertexLabel {
  readonly measurementId: MeasurementId;
  readonly vertexIndex: number;
}

export const activeVertexLabel = writable<ActiveVertexLabel | null>(null);

export function activateVertexLabel(measurementId: MeasurementId, vertexIndex: number): void {
  activeVertexLabel.set({ measurementId, vertexIndex });
}

export function clearActiveVertexLabel(): void {
  activeVertexLabel.set(null);
}
