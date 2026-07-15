import type { Command } from '../commandStack.js';
import type { MeasurementId, Surface } from '../../core/domain/entities.js';

export interface ReorderMeasurementsParams {
  readonly surface: Surface;
  /** Every measurement id currently visible in the Layers panel, front-to-back (index 0 =
   * topmost row = rendered last / on top). MeasurementList.svelte always passes its complete
   * row order after a drag completes — never a partial list — since a layer's raw draw order
   * (sceneRenderer.ts, first-drawn-first) is simply this sequence reversed. Ids belonging to
   * different Layers are reordered independently within their own layer; relative order across
   * layers doesn't apply since sceneRenderer already iterates layer-by-layer. */
  readonly orderedIdsFrontToBack: readonly MeasurementId[];
}

/** Drag-to-reorder in the Layers panel (renamed from "Measurements" — PO request): moving a row
 * changes the underlying Layer.measurements draw order, which is the same array sceneRenderer.ts
 * iterates for z-stacking. No geometry involved, so this can never throw. */
export function reorderMeasurementsCommand(params: ReorderMeasurementsParams): Command<Surface> {
  const before = params.surface;
  const rank = new Map(params.orderedIdsFrontToBack.map((id, i) => [id, i]));
  // Reversed: front-most (rank 0) must be drawn last, i.e. sort to the end of the raw array.
  const rankOf = (id: MeasurementId): number => rank.get(id) ?? Number.POSITIVE_INFINITY;

  return {
    target: before.id,
    label: 'ReorderMeasurements',
    do: () => ({
      ...before,
      layers: before.layers.map((layer) => ({
        ...layer,
        measurements: [...layer.measurements].sort((a, b) => rankOf(b.id) - rankOf(a.id)),
      })),
    }),
    undo: () => before,
    event: { type: 'MeasurementsReordered', surfaceId: before.id },
  };
}
