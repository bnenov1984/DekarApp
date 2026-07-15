import { describe, expect, it } from 'vitest';
import { computeMeasurementDisplay } from './computeDisplay.js';
import type { CircleShape, LineShape, PolygonShape } from '../../core/domain/types.js';

describe('computeMeasurementDisplay — px mode (no Surface today has a Calibration)', () => {
  it('formats a polygon area with px² suffix, whole pixels (17 §5 px rule)', () => {
    const square: PolygonShape = {
      type: 'polygon',
      vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100.6 }, { x: 0, y: 100.6 }],
    };
    const display = computeMeasurementDisplay(square, null);
    expect(display.values.unit).toBe('px');
    expect(display.primaryLabel).toBe('10060 px²'); // 100 * 100.6 = 10060, rounded to whole px
  });

  it('formats a line length with px suffix', () => {
    const line: LineShape = { type: 'line', from: { x: 0, y: 0 }, to: { x: 3, y: 4 } };
    const display = computeMeasurementDisplay(line, null);
    expect(display.primaryLabel).toBe('5 px'); // 3-4-5 triangle
  });

  it('formats a circle area', () => {
    const circle: CircleShape = { type: 'circle', center: { x: 0, y: 0 }, radius: 10 };
    const display = computeMeasurementDisplay(circle, null);
    expect(display.primaryLabel).toBe(`${Math.round(Math.PI * 100)} px²`);
  });
});
