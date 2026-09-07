import { describe, expect, it } from 'vitest';
import {
  applyManualArea,
  computeMeasurementDisplay,
  dimensionUnitFor,
  formatAreaValue,
  formatDimensionDraft,
  formatLengthValue,
  parseDimensionToPx,
} from './computeDisplay.js';
import type { CircleShape, LineShape, PolygonShape } from '../../core/domain/types.js';

describe('computeMeasurementDisplay — px mode (no Surface today has a Calibration)', () => {
  it('formats a polygon area with px² suffix, whole pixels (17 §5 px rule)', () => {
    const square: PolygonShape = {
      type: 'polygon',
      vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100.6 }, { x: 0, y: 100.6 }],
    };
    const display = computeMeasurementDisplay(square, null);
    expect(display.values.unit).toBe('px');
    expect(display.primaryLabel).toBe('10,060 px²'); // 100 * 100.6 = 10060, rounded to whole px, grouped
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

// PO request (expanded unit system) — every requestable Unit gets the right suffix and a sensible
// (not excessive) decimal count; same square measured at every unit, calibrated so the numbers
// land on round-ish values.
describe('computeMeasurementDisplay — expanded unit system (calibrated)', () => {
  const square: PolygonShape = {
    type: 'polygon',
    vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
  };
  const calibration = { kind: 'linear' as const, metersPerPixel: 0.1 }; // 100x100px = 10x10m = 100 m²

  it('mm2 — whole numbers, mm² suffix, grouped', () => {
    expect(computeMeasurementDisplay(square, calibration, 'mm2').primaryLabel).toBe('100,000,000 mm²');
  });

  it('cm2 — whole numbers, cm² suffix, grouped', () => {
    expect(computeMeasurementDisplay(square, calibration, 'cm2').primaryLabel).toBe('1,000,000 cm²');
  });

  it('m2 — 2 decimals, m² suffix', () => {
    expect(computeMeasurementDisplay(square, calibration, 'm2').primaryLabel).toBe('100 m²');
  });

  it('in2 — 1 decimal, in² suffix', () => {
    const label = computeMeasurementDisplay(square, calibration, 'in2').primaryLabel;
    expect(label.endsWith(' in²')).toBe(true);
    expect(label).toMatch(/^[\d,]+(\.\d)? in²$/);
  });

  it('ft2 — 2 decimals, ft² suffix, grouped', () => {
    const label = computeMeasurementDisplay(square, calibration, 'ft2').primaryLabel;
    expect(label).toMatch(/^[\d,]+(\.\d{1,2})? ft²$/);
  });

  it('a Line (length-only) resolves the paired length unit — mm2 request formats as mm, grouped', () => {
    const line: LineShape = { type: 'line', from: { x: 0, y: 0 }, to: { x: 30, y: 40 } }; // 50px = 5m
    const display = computeMeasurementDisplay(line, calibration, 'mm2');
    expect(display.primaryLabel).toBe('5,000 mm');
  });

  // QA regression — a Polygon's `values.unit` is always the AREA unit (e.g. 'm2'), even though
  // `values.perimeter` is already numerically in the paired length unit; formatLengthValue must
  // still label it correctly ("m", not the literal "m2") when fed that same shared `unit` field —
  // this is exactly how PropertyPanel.svelte's Perimeter row and csvExport.ts call it.
  it('formatLengthValue labels a Polygon perimeter with the paired length unit, not the area unit verbatim', () => {
    const display = computeMeasurementDisplay(square, calibration, 'm2');
    expect(display.values.unit).toBe('m2'); // the shared field really is the area unit
    expect(formatLengthValue(display.values.perimeter!, display.values.unit)).toBe('40 m'); // not "40 m2"
  });

  it('formatLengthValue labels a Polygon perimeter correctly for every area unit requested', () => {
    expect(formatLengthValue(40, 'ft2')).toBe('40 ft'); // not "40 ft2"
    expect(formatLengthValue(40, 'mm2')).toBe('40 mm');
    expect(formatLengthValue(40, 'cm2')).toBe('40 cm');
    expect(formatLengthValue(40, 'in2')).toBe('40 in');
  });
});

// PO request (§8 "one centralized formatting/conversion service... all projections show the same
// converted result from the same source measurement") — regression coverage for a real bug found
// live: MeasurementList.svelte's Σ Total area footer used to format its own sum inline (bare
// "1076 ft2", whole-number-rounded regardless of unit) instead of going through this same module,
// silently drifting from every per-row/chip/panel label ("1076.39 ft²") for the exact same value.
describe('formatAreaValue / formatLengthValue — same module every projection now shares', () => {
  const square: PolygonShape = {
    type: 'polygon',
    vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
  };
  const calibration = { kind: 'linear' as const, metersPerPixel: 0.1 };

  it('formatAreaValue produces byte-identical text to computeMeasurementDisplay.primaryLabel for the same area/unit', () => {
    const display = computeMeasurementDisplay(square, calibration, 'ft2');
    expect(formatAreaValue(display.values.area!, display.values.unit)).toBe(display.primaryLabel);
    expect(display.primaryLabel).toBe('1,076.39 ft²'); // the exact value found drifting live, now grouped (item B2)
  });

  it('formatLengthValue produces byte-identical text to computeMeasurementDisplay.primaryLabel for the same length/unit', () => {
    const line: LineShape = { type: 'line', from: { x: 0, y: 0 }, to: { x: 30, y: 40 } };
    const display = computeMeasurementDisplay(line, calibration, 'ft2');
    expect(formatLengthValue(display.values.length!, display.values.unit)).toBe(display.primaryLabel);
  });
});

// PO follow-up ("numeric input fields for dimensions") — PropertyPanel's Width/Height/Radius
// inputs: the unit they're expressed/typed in, and the round-trip (typed text -> px -> compute() ->
// formatted draft) staying consistent with the existing display pipeline above.
describe('dimensionUnitFor / formatDimensionDraft / parseDimensionToPx', () => {
  const linear = { kind: 'linear' as const, metersPerPixel: 0.1 }; // 1px = 10cm

  it('dimensionUnitFor is always px when uncalibrated, regardless of the requested displayUnit', () => {
    expect(dimensionUnitFor(null, 'm2')).toBe('px');
    expect(dimensionUnitFor(null, 'ft2')).toBe('px');
  });

  it('dimensionUnitFor resolves the paired length unit for a linear calibration', () => {
    expect(dimensionUnitFor(linear, 'm2')).toBe('m');
    expect(dimensionUnitFor(linear, 'ft2')).toBe('ft');
    expect(dimensionUnitFor(linear, 'mm2')).toBe('mm');
  });

  it('dimensionUnitFor falls back to px for Geo (no numeric-dimension UI offered there)', () => {
    expect(dimensionUnitFor({ kind: 'geo' }, 'm2')).toBe('m');
  });

  it('parseDimensionToPx passes an uncalibrated (px-mode) value straight through', () => {
    expect(parseDimensionToPx('120', null, 'm2')).toBe(120);
  });

  it('parseDimensionToPx converts a typed length in the display unit to Surface-space px', () => {
    // 12m typed, 1px = 0.1m -> 120px
    expect(parseDimensionToPx('12', linear, 'm2')).toBeCloseTo(120, 8);
  });

  it('parseDimensionToPx returns null for blank, non-numeric, or non-positive input', () => {
    expect(parseDimensionToPx('', linear, 'm2')).toBeNull();
    expect(parseDimensionToPx('abc', linear, 'm2')).toBeNull();
    expect(parseDimensionToPx('0', linear, 'm2')).toBeNull();
    expect(parseDimensionToPx('-5', linear, 'm2')).toBeNull();
  });

  it('parseDimensionToPx returns null for Geo calibration (no Surface-space px to convert into)', () => {
    expect(parseDimensionToPx('12', { kind: 'geo' }, 'm2')).toBeNull();
  });

  it('formatDimensionDraft round-trips through the same rounding rules as computeMeasurementDisplay', () => {
    const rect = { type: 'rectangle' as const, origin: { x: 0, y: 0 }, width: 100, height: 50, rotation: 0 };
    const display = computeMeasurementDisplay(rect, linear, 'm2');
    const unit = dimensionUnitFor(linear, 'm2');
    expect(formatDimensionDraft(display.values.width!, unit)).toBe('10');
    expect(formatDimensionDraft(display.values.height!, unit)).toBe('5');
  });
});

// PO request (manual area) — applyManualArea overrides only area/primaryLabel/unit, recomputed
// fresh from the shape's *current* vertices every call (never a cached number), which is what
// makes a manually-set area track proportionally through later geometry edits.
describe('applyManualArea', () => {
  const square: PolygonShape = {
    type: 'polygon',
    vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], // 10,000 px²
  };

  it('is a no-op when manualArea is undefined', () => {
    const display = computeMeasurementDisplay(square, null);
    const result = applyManualArea(display, undefined, square.vertices, 'm2');
    expect(result).toBe(display);
  });

  it('overrides area/primaryLabel to the manual reference, independent of an uncalibrated Surface', () => {
    const display = computeMeasurementDisplay(square, null); // px mode — no scale at all
    // 1200 m² typed against this shape's 10,000 px² geometric area
    const manualArea = { squareMetersPerSquarePixel: 1200 / 10_000 };
    const result = applyManualArea(display, manualArea, square.vertices, 'm2');
    expect(result.values.area).toBeCloseTo(1200, 6);
    expect(result.primaryLabel).toBe('1,200 m²');
    // perimeter/vertexCount are untouched — only area is overridden
    expect(result.values.perimeter).toBe(display.values.perimeter);
  });

  it('recomputes proportionally when the shape geometry changes (e.g. a vertex drag)', () => {
    const display = computeMeasurementDisplay(square, null);
    const manualArea = { squareMetersPerSquarePixel: 1200 / 10_000 };
    // resized to double the width -> double the px² area -> double the displayed manual area
    const resized: PolygonShape = {
      type: 'polygon',
      vertices: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }],
    };
    const result = applyManualArea(display, manualArea, resized.vertices, 'm2');
    expect(result.values.area).toBeCloseTo(2400, 6);
  });

  it('converts to the requested display unit', () => {
    const display = computeMeasurementDisplay(square, null);
    const manualArea = { squareMetersPerSquarePixel: 1200 / 10_000 };
    const result = applyManualArea(display, manualArea, square.vertices, 'ft2');
    expect(result.primaryLabel.endsWith('ft²')).toBe(true);
  });

  it('splitting a manual-area polygon into 3 equal parts sums back to the original', () => {
    // Simulates the child inheritance splitIntoPartsCommand performs: same
    // squareMetersPerSquarePixel factor on 3 children whose px² areas sum to the parent's.
    const manualArea = { squareMetersPerSquarePixel: 1200 / 10_000 };
    const childVertices: readonly { x: number; y: number }[][] = [
      [{ x: 0, y: 0 }, { x: 34, y: 0 }, { x: 34, y: 100 }, { x: 0, y: 100 }], // ~3400 px²
      [{ x: 34, y: 0 }, { x: 67, y: 0 }, { x: 67, y: 100 }, { x: 34, y: 100 }], // ~3300 px²
      [{ x: 67, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 67, y: 100 }], // ~3300 px²
    ];
    const display = computeMeasurementDisplay(square, null);
    const totalDisplayed = childVertices
      .map((vertices) => applyManualArea(display, manualArea, vertices, 'm2').values.area!)
      .reduce((sum, a) => sum + a, 0);
    expect(totalDisplayed).toBeCloseTo(1200, 6);
  });
});
