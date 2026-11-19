import { describe, expect, it } from 'vitest';
import { canExportPicture, computeExportBounds, computeExportTransform } from './pictureExport.js';
import type { Layer, Measurement, Surface } from '../../core/domain/entities.js';

function surfaceWith(measurements: Measurement[], extra: Partial<Surface> = {}): Surface {
  const layer: Layer = { id: 'layer1', name: 'Default', visible: true, order: 0, measurements };
  return { id: 'surface1', kind: 'blank', calibration: null, layers: [layer], ...extra };
}

const square: Measurement = {
  id: 'm1',
  shape: { type: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
  identity: { name: 'Parcel A', color: '#2E7D32' },
  provenance: 'Manual',
  locked: false,
};

const hiddenSquare: Measurement = {
  ...square,
  id: 'm2',
  identity: { ...square.identity, hidden: true },
};

function fakeBitmap(width: number, height: number): ImageBitmap {
  return { width, height } as ImageBitmap;
}

describe('computeExportBounds', () => {
  it('null for a Surface with nothing on it', () => {
    expect(computeExportBounds(surfaceWith([]), null)).toBeNull();
  });

  it('unions every visible Measurement — grilling 2026-11-19 Q1/Q3', () => {
    const other: Measurement = {
      ...square,
      id: 'm3',
      shape: { type: 'polygon', vertices: [{ x: 20, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 40 }, { x: 20, y: 40 }] },
    };
    expect(computeExportBounds(surfaceWith([square, other]), null)).toEqual({ minX: 0, minY: 0, maxX: 40, maxY: 40 });
  });

  it('excludes a hidden Measurement from the bounds (Q1 — hidden content never influences the crop)', () => {
    const farAway: Measurement = {
      ...hiddenSquare,
      shape: { type: 'polygon', vertices: [{ x: 1000, y: 1000 }, { x: 1010, y: 1000 }, { x: 1010, y: 1010 }, { x: 1000, y: 1010 }] },
    };
    expect(computeExportBounds(surfaceWith([square, farAway]), null)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });

  it('includes the background image rect even with no measurements', () => {
    const bounds = computeExportBounds(surfaceWith([], { kind: 'image' }), fakeBitmap(200, 100));
    expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 200, maxY: 100 });
  });

  it('unions the background image rect with Measurement bounds', () => {
    const bounds = computeExportBounds(surfaceWith([square], { kind: 'image' }), fakeBitmap(200, 100));
    expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 200, maxY: 100 });
  });
});

describe('canExportPicture (Q10 — split gate from CSV)', () => {
  it('false for a blank Surface with no measurements and no background image', () => {
    expect(canExportPicture(surfaceWith([]), null)).toBe(false);
  });

  it('true with at least one Measurement, even if hidden', () => {
    expect(canExportPicture(surfaceWith([hiddenSquare]), null)).toBe(true);
  });

  it('true with a background image and zero measurements (an imported plan, nothing drawn yet)', () => {
    expect(canExportPicture(surfaceWith([], { kind: 'image' }), fakeBitmap(200, 100))).toBe(true);
  });
});

describe('computeExportTransform (Q7 2x oversampling, Q8 fixed padding)', () => {
  it('sizes the canvas to the padded content at 2x', () => {
    const transform = computeExportTransform({ minX: 0, minY: 0, maxX: 100, maxY: 50 });
    // (100 + 24*2) * 2, (50 + 24*2) * 2
    expect(transform.canvasWidthPx).toBe(296);
    expect(transform.canvasHeightPx).toBe(196);
    expect(transform.scale).toBe(2);
  });

  it('maps the bounds minimum to the padded top-left corner', () => {
    const transform = computeExportTransform({ minX: 10, minY: 20, maxX: 110, maxY: 70 });
    const screenX = transform.scale * 10 + transform.offsetX;
    const screenY = transform.scale * 20 + transform.offsetY;
    expect(screenX).toBe(48); // 24px padding * 2x scale
    expect(screenY).toBe(48);
  });

  it('never produces a zero or negative canvas size for a degenerate (single-point) bounds', () => {
    const transform = computeExportTransform({ minX: 5, minY: 5, maxX: 5, maxY: 5 });
    expect(transform.canvasWidthPx).toBeGreaterThan(0);
    expect(transform.canvasHeightPx).toBeGreaterThan(0);
  });
});
