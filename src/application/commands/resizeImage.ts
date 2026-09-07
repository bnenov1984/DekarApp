import type { Command } from '../commandStack.js';
import type { Surface } from '../../core/domain/entities.js';
import type { Point } from '../../core/domain/types.js';

export interface ResizeImageParams {
  readonly surface: Surface;
  readonly origin: Point;
  readonly width: number;
  readonly height: number;
}

/** PO request (resizable imported image) — replaces `Surface.imageRect` wholesale, same "VOs
 * replaced not mutated" discipline as every other geometry mutation (14 §3). The corner-drag
 * math that produces `origin`/`width`/`height` lives in Core's `resizeRectangleCorner` (reused,
 * not duplicated — imageResizeSession.ts calls it against a synthetic Rectangle shape), so this
 * command only needs to guard the same structural precondition that function already throws on,
 * in case a caller ever constructs params by another path. */
export function resizeImageCommand(params: ResizeImageParams): Command<Surface> {
  const before = params.surface;
  const { origin, width, height } = params;
  if (width <= 0 || height <= 0) {
    throw new Error('resizeImageCommand: width and height must be positive');
  }

  return {
    target: before.id,
    label: 'ResizeImage',
    do: () => ({ ...before, imageRect: { origin, width, height } }),
    undo: () => before,
    event: { type: 'SurfaceImageResized', surfaceId: before.id },
  };
}
