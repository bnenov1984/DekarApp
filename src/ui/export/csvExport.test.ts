import { describe, expect, it } from 'vitest';
import { buildMeasurementsCsv, csvFilename } from './csvExport.js';
import type { Layer, Measurement, Surface } from '../../core/domain/entities.js';

function surfaceWith(measurements: Measurement[]): Surface {
  const layer: Layer = { id: 'layer1', name: 'Default', visible: true, order: 0, measurements };
  return { id: 'surface1', kind: 'blank', calibration: null, layers: [layer] };
}

describe('buildMeasurementsCsv', () => {
  it('emits just the header for a Surface with no measurements', () => {
    expect(buildMeasurementsCsv(surfaceWith([]), 'px')).toBe('Name,Type,Area,Perimeter,Length,Note');
  });

  it('fills Area/Perimeter (not Length) for a closed shape', () => {
    const square: Measurement = {
      id: 'm1',
      shape: { type: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
      identity: { name: 'Parcel A', color: '#2E7D32' },
      provenance: 'Manual',
      locked: false,
    };
    const csv = buildMeasurementsCsv(surfaceWith([square]), 'px');
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Name,Type,Area,Perimeter,Length,Note');
    expect(lines[1]).toBe('Parcel A,Polygon,100 px²,40 px,,');
  });

  it('fills Length (not Area/Perimeter) for an open shape (Line)', () => {
    const line: Measurement = {
      id: 'm2',
      shape: { type: 'line', from: { x: 0, y: 0 }, to: { x: 3, y: 4 } },
      identity: { name: 'Fence run', color: '#1565C0' },
      provenance: 'Manual',
      locked: false,
    };
    const csv = buildMeasurementsCsv(surfaceWith([line]), 'px');
    expect(csv.split('\r\n')[1]).toBe('Fence run,Distance,,,5 px,');
  });

  it('includes the Note column and quotes a note containing a comma per RFC 4180', () => {
    const circle: Measurement = {
      id: 'm3',
      shape: { type: 'circle', center: { x: 0, y: 0 }, radius: 10 },
      identity: { name: 'Pool', color: '#00838F', note: 'Needs fencing, per code' },
      provenance: 'Manual',
      locked: false,
    };
    const csv = buildMeasurementsCsv(surfaceWith([circle]), 'px');
    expect(csv.split('\r\n')[1]).toBe(`Pool,Circle,${Math.round(Math.PI * 100)} px²,${Math.round(2 * Math.PI * 10)} px,,"Needs fencing, per code"`);
  });

  it('doubles an embedded quote inside a quoted field', () => {
    const m: Measurement = {
      id: 'm4',
      shape: { type: 'rectangle', origin: { x: 0, y: 0 }, width: 10, height: 10, rotation: 0 },
      identity: { name: '10x10 "shed"', color: '#37474F' },
      provenance: 'Manual',
      locked: false,
    };
    const csv = buildMeasurementsCsv(surfaceWith([m]), 'px');
    expect(csv.split('\r\n')[1]!.startsWith('"10x10 ""shed""",Rectangle,')).toBe(true);
  });

  // QA regression — a manual-area Measurement's Area column must show the recorded real-world
  // value, not the raw geometric area. Perimeter stays in the Surface's own unit (px, uncalibrated
  // here) regardless of the manual area or the requested display unit — manual area overrides
  // area only, it must not relabel Perimeter (a prior bug: it briefly showed "40 m2"/"40 m" for an
  // uncalibrated shape once a manual area was set, which would misleadingly imply a real scale).
  it('exports the manual area, not the raw geometric area, for a Measurement with one set', () => {
    const square: Measurement = {
      id: 'm5',
      shape: { type: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
      identity: { name: 'Parcel B', color: '#2E7D32' },
      provenance: 'Manual',
      locked: false,
      manualArea: { squareMetersPerSquarePixel: 12 }, // 100 px² * 12 = 1200 m²
    };
    const csv = buildMeasurementsCsv(surfaceWith([square]), 'm2');
    expect(csv.split('\r\n')[1]).toBe('Parcel B,Polygon,"1,200 m²",40 px,,');
  });

  it('one row per measurement, in Surface (creation) order', () => {
    const a: Measurement = {
      id: 'a',
      shape: { type: 'rectangle', origin: { x: 0, y: 0 }, width: 1, height: 1, rotation: 0 },
      identity: { name: 'A', color: '#000' },
      provenance: 'Manual',
      locked: false,
    };
    const b: Measurement = { ...a, id: 'b', identity: { name: 'B', color: '#000' } };
    const csv = buildMeasurementsCsv(surfaceWith([a, b]), 'px');
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[1]!.startsWith('A,')).toBe(true);
    expect(lines[2]!.startsWith('B,')).toBe(true);
  });
});

describe('csvFilename', () => {
  it('turns spaces into hyphens and appends .csv', () => {
    expect(csvFilename('123 Main St')).toBe('123-Main-St.csv');
  });

  it('strips characters invalid in a filename', () => {
    expect(csvFilename('Lot 4 / Block "B"')).toBe('Lot-4-Block-B.csv');
  });

  it('falls back to a fixed name when nothing usable remains', () => {
    expect(csvFilename('   ')).toBe('areaflow-export.csv');
    expect(csvFilename('///')).toBe('areaflow-export.csv');
  });
});
