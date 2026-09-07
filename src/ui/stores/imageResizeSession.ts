import { writable, get } from 'svelte/store';
import type { Point } from '../../core/domain/types.js';
import type { RectangleCorner } from '../../core/drawing/drawingEngine.js';
import { findRectangleCornerAt } from '../../core/drawing/hitTest.js';
import { computeContainRect } from '../rendering/sceneRenderer.js';
import { resizeImage } from './studioSession.js';
import type { Surface } from '../../core/domain/entities.js';

// PO request: make the imported background image resizable/movable, keeping its native aspect
// ratio, and lockable (Photoshop-style Background layer — locked by default, blocks every
// interaction here). There's no separate ImageAsset Shape kind in Core — reusing a synthetic,
// always-unrotated Rectangle shape as the input to the already-tested `findRectangleCornerAt`
// avoids duplicating that hit-test math a second time. The actual resize math is NOT
// `resizeRectangleCorner` (that one free-resizes, correct for Rectangle Measurements but not for
// an image, which must keep its aspect ratio — PO correction after live testing) — see
// `resizeRectAspectLocked` below.

export interface ImageRect {
  readonly origin: Point;
  readonly width: number;
  readonly height: number;
}

const HANDLE_TOLERANCE = 8;

function corners(rect: ImageRect): readonly Point[] {
  return [
    rect.origin,
    { x: rect.origin.x + rect.width, y: rect.origin.y },
    { x: rect.origin.x + rect.width, y: rect.origin.y + rect.height },
    { x: rect.origin.x, y: rect.origin.y + rect.height },
  ];
}

/** Exported for CanvasStage's click-to-select (PO follow-up, background layer selectability): a
 * Select-tool click that misses every Measurement falls back to this same bounds check to decide
 * whether it landed on the background image (select it) or truly empty canvas (deselect). */
export function pointInRect(point: Point, rect: ImageRect): boolean {
  return (
    point.x >= rect.origin.x &&
    point.x <= rect.origin.x + rect.width &&
    point.y >= rect.origin.y &&
    point.y <= rect.origin.y + rect.height
  );
}

/** Resizes `rect` by dragging `corner` to `dragPoint`, keeping the diagonally opposite corner
 * fixed (same convention as Core's `resizeRectangleCorner`) AND keeping `aspectRatio`
 * (width/height) constant — unlike that function, which free-resizes (correct for a Rectangle
 * Measurement, wrong for an image: PO reported it stretching out of proportion). Whichever axis
 * the drag implies a larger size on (relative to the other, scaled by aspect ratio) drives the
 * result — the same "dominant axis" convention most design tools use for a corner-drag with
 * aspect lock. Throws on a degenerate (zero) result, same convention as every other resize here. */
export function resizeRectAspectLocked(
  rect: ImageRect,
  corner: RectangleCorner,
  dragPoint: Point,
  aspectRatio: number,
): ImageRect {
  const fixed = corners(rect)[(corner + 2) % 4]!;
  const dx = dragPoint.x - fixed.x;
  const dy = dragPoint.y - fixed.y;
  const rawWidth = Math.abs(dx);
  const rawHeight = Math.abs(dy);

  const width = rawWidth / aspectRatio >= rawHeight ? rawWidth : rawHeight * aspectRatio;
  const height = width / aspectRatio;
  if (width <= 0 || height <= 0) {
    throw new Error('resizeRectAspectLocked: resulting rect must have positive width/height');
  }

  return {
    origin: { x: dx < 0 ? fixed.x - width : fixed.x, y: dy < 0 ? fixed.y - height : fixed.y },
    width,
    height,
  };
}

/** The rect actually drawn today — `Surface.imageRect` once the user has resized/moved it, else
 * the "contain"-fit default. Returns `null` for a not-yet-decoded/zero-size image (nothing to hit
 * or draw yet). CanvasStage passes the live bitmap dimensions in since neither the bitmap nor the
 * container size live on the Surface aggregate. */
export function effectiveImageRect(
  surface: Surface,
  bitmapWidth: number,
  bitmapHeight: number,
  boxWidth: number,
  boxHeight: number,
): ImageRect | null {
  if (surface.imageRect) return surface.imageRect;
  const rect = computeContainRect(bitmapWidth, bitmapHeight, boxWidth, boxHeight);
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { origin: { x: rect.x, y: rect.y }, width: rect.width, height: rect.height };
}

/** Live preview while a resize/move drag is in progress — CanvasStage reads this (falling back
 * to the persisted rect) so the background repaints during the drag without a Command on every
 * mousemove (same "commit on pointer-up only" discipline as vertexEditSession.ts). */
export const imageResizeDrag = writable<ImageRect | null>(null);

interface ActiveDrag {
  readonly kind: 'resize' | 'move';
  readonly corner: RectangleCorner | null;
  readonly startPoint: Point;
  readonly startRect: ImageRect;
  readonly aspectRatio: number;
}

let activeDrag: ActiveDrag | null = null;

/** True if `point` is within `tolerance` of one of `rect`'s 4 corner handles. */
export function findImageCornerAt(point: Point, rect: ImageRect, tolerance = HANDLE_TOLERANCE): RectangleCorner | null {
  return findRectangleCornerAt(point, { type: 'rectangle', origin: rect.origin, width: rect.width, height: rect.height, rotation: 0 }, tolerance);
}

/**
 * Starts a resize (corner hit) or move (body hit) drag; returns whether it did, so the caller
 * (CanvasStage's mousedown) knows whether to consume the event.
 *
 * `locked` (Surface.imageLocked ?? true) blocks every interaction outright — a locked Background
 * layer is non-transformable, full stop.
 *
 * `measurementUnderCursor` blocks only the body-hit (move) branch — a corner handle is a small,
 * deliberate target so it always wins, but the much larger image body must NOT swallow clicks
 * that are meant to select/interact with a Measurement drawn on top of the image (found this
 * would otherwise break ordinary measurement selection the moment the image is unlocked).
 */
export function pointerDown(
  point: Point,
  rect: ImageRect,
  aspectRatio: number,
  locked: boolean,
  measurementUnderCursor: boolean,
): boolean {
  if (locked) return false;

  const corner = findImageCornerAt(point, rect);
  if (corner !== null) {
    activeDrag = { kind: 'resize', corner, startPoint: point, startRect: rect, aspectRatio };
    imageResizeDrag.set(rect);
    return true;
  }

  if (!measurementUnderCursor && pointInRect(point, rect)) {
    activeDrag = { kind: 'move', corner: null, startPoint: point, startRect: rect, aspectRatio };
    imageResizeDrag.set(rect);
    return true;
  }

  return false;
}

export function pointerMove(point: Point): void {
  if (!activeDrag) return;

  if (activeDrag.kind === 'resize') {
    try {
      imageResizeDrag.set(resizeRectAspectLocked(activeDrag.startRect, activeDrag.corner!, point, activeDrag.aspectRatio));
    } catch {
      // Dragged onto/past the fixed opposite corner — degenerate, freeze the preview at its last
      // valid value (same silent-reject discipline as vertexEditSession.ts).
    }
    return;
  }

  // 'move' — a rigid translate, like Core's translateShape, can never be degenerate.
  const dx = point.x - activeDrag.startPoint.x;
  const dy = point.y - activeDrag.startPoint.y;
  imageResizeDrag.set({
    origin: { x: activeDrag.startRect.origin.x + dx, y: activeDrag.startRect.origin.y + dy },
    width: activeDrag.startRect.width,
    height: activeDrag.startRect.height,
  });
}

/** Commits the drag's final rect via `studioSession.resizeImage` (undoable) — but only if it
 * actually changed; a click-without-drag stays a no-op, same pattern as vertexEditSession.ts's
 * whole-shape move. No-ops entirely if nothing was being dragged. */
export function pointerUp(): void {
  const result = get(imageResizeDrag);
  const start = activeDrag?.startRect ?? null;
  activeDrag = null;
  imageResizeDrag.set(null);
  if (!result) return;

  const unchanged =
    start !== null &&
    result.origin.x === start.origin.x &&
    result.origin.y === start.origin.y &&
    result.width === start.width &&
    result.height === start.height;
  if (!unchanged) resizeImage(result.origin, result.width, result.height);
}

export function isResizing(): boolean {
  return activeDrag !== null;
}
