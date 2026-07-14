import { describe, expect, it } from 'vitest';
import {
  computeGeoPolygonArea,
  projectToLocalTangentPlane,
  shoelaceArea,
  sphericalExcessArea,
} from './formulas.js';
import { compute } from './measurementEngine.js';
import type { PolygonShape } from '../domain/types.js';

// docs/17_MEASUREMENT_ENGINE.md §4.1 — "тестова котва": the regression guard against the
// Mercator/geodesic risk flagged in PHASE_2_REVIEW §5 and closed (Engineering-only) in PD-018 §8.
//
// Ground-truth method: rather than citing an unverified "real-world parcel" (this environment
// has no way to independently confirm third-party published coordinates/areas), the fixture is
// built from first principles and cross-checked two ways:
//
//   1. A square of known real side length `s` is placed in local ENU meters at a given center
//      latitude, then converted to lat/lng via the *exact inverse* of the tangent-plane
//      projection formula (17 §4 rule 2). Running the forward projection on it must recover the
//      square almost exactly — this proves forward/inverse consistency, not correctness in
//      isolation.
//   2. The SAME fixture is independently checked against sphericalExcessArea — a differently
//      derived formula (17 §4 rule 3) that was not used to construct the fixture. For a small
//      square this must also recover ≈ s², which is a genuine independent cross-check.
//   3. A naive "flat shoelace directly on raw (lng, lat) degrees" computation — the exact bug
//      17 §4 exists to prevent — is run on the same fixture and shown to diverge sharply from
//      s² as latitude increases. This is the regression tripwire: if a future refactor
//      accidentally routes geo Shapes through plain shoelaceArea() instead of
//      computeGeoPolygonArea(), this assertion (or the MeasurementEngine-level ones below) fails.

const EARTH_RADIUS_M = 6_371_000;
const DEG = Math.PI / 180;

/** Inverse of projectToLocalTangentPlane: given ENU meter offsets from a center lat/lng,
 * recover the corresponding (lng, lat) in degrees. */
function enuSquareAroundCenter(centerLatDeg: number, centerLngDeg: number, sideMeters: number) {
  const lat0 = centerLatDeg * DEG;
  const lng0 = centerLngDeg * DEG;
  const half = sideMeters / 2;
  const corners = [
    { x: -half, y: -half },
    { x: half, y: -half },
    { x: half, y: half },
    { x: -half, y: half },
  ];
  return corners.map(({ x, y }) => ({
    x: (lng0 + x / (EARTH_RADIUS_M * Math.cos(lat0))) / DEG,
    y: (lat0 + y / EARTH_RADIUS_M) / DEG,
  }));
}

/** The bug this whole file exists to prevent: plain planar shoelace fed raw lat/lng degrees. */
function naiveFlatAreaOnRawLatLng(verticesLatLng: readonly { x: number; y: number }[]): number {
  return shoelaceArea(verticesLatLng);
}

describe('geo golden anchor — 100m square at increasing latitude', () => {
  const side = 100; // meters
  const expectedArea = side * side; // 10,000 m²
  const latitudes = [0, 30, 60, 85];

  it.each(latitudes)('tangent-plane projection recovers ~%s° latitude square within 0.5%%', (lat) => {
    const square = enuSquareAroundCenter(lat, 23.32, side);
    const area = computeGeoPolygonArea(square);
    const errorPct = Math.abs(area - expectedArea) / expectedArea;
    expect(errorPct).toBeLessThan(0.005);
  });

  it.each(latitudes)('spherical-excess formula independently agrees at %s° latitude within 0.5%%', (lat) => {
    const square = enuSquareAroundCenter(lat, 23.32, side);
    const area = sphericalExcessArea(square);
    const errorPct = Math.abs(area - expectedArea) / expectedArea;
    expect(errorPct).toBeLessThan(0.005);
  });

  it('naive flat shoelace on raw lat/lng diverges sharply from truth as latitude grows', () => {
    const errors = latitudes.map((lat) => {
      const square = enuSquareAroundCenter(lat, 23.32, side);
      const naiveAreaDeg2 = naiveFlatAreaOnRawLatLng(square); // in degrees² — nonsensical unit, but that IS the bug
      // Convert degrees² to an approximate m² using an equatorial scale, to make the divergence legible.
      const metersPerDegAtEquator = EARTH_RADIUS_M * DEG;
      const naiveAreaApproxM2 = naiveAreaDeg2 * metersPerDegAtEquator * metersPerDegAtEquator;
      return Math.abs(naiveAreaApproxM2 - expectedArea) / expectedArea;
    });
    // At the equator the naive approach is least wrong; at 85° it must be dramatically wrong
    // (longitude degrees compress by cos(lat) — area is overestimated by roughly 1/cos(85°) ≈ 11.5×).
    expect(errors[0]).toBeLessThan(0.05);
    expect(errors[3]!).toBeGreaterThan(2); // >200% error at 85° — the tripwire
    expect(errors[3]!).toBeGreaterThan(errors[0]!);
  });
});

describe('MeasurementEngine.compute — geo calibration end-to-end', () => {
  it('computes a plausible area for a small parcel-sized polygon at high latitude', () => {
    const square = enuSquareAroundCenter(64, 10, 500); // 64°N, 500m side, 250,000 m²
    const shape: PolygonShape = { type: 'polygon', vertices: square };
    const values = compute(shape, { kind: 'geo' }, 'm2');
    expect(values.unit).toBe('m2');
    expect(values.area).toBeGreaterThan(0);
    const errorPct = Math.abs(values.area! - 250_000) / 250_000;
    expect(errorPct).toBeLessThan(0.01);
  });

  it('switches to spherical-excess for polygons above the large-area threshold without error', () => {
    // A ~10km square, above LARGE_AREA_THRESHOLD_M2 (5 km²) — must not throw, must stay sane.
    const square = enuSquareAroundCenter(45, 20, 10_000);
    const shape: PolygonShape = { type: 'polygon', vertices: square };
    const values = compute(shape, { kind: 'geo' }, 'm2');
    const errorPct = Math.abs(values.area! - 100_000_000) / 100_000_000;
    expect(errorPct).toBeLessThan(0.02);
  });
});

describe('projectToLocalTangentPlane — sanity', () => {
  it('projects the centroid of a symmetric square to approximately the origin', () => {
    const square = enuSquareAroundCenter(50, 15, 200);
    const projected = projectToLocalTangentPlane(square);
    const cx = projected.reduce((s, p) => s + p.x, 0) / projected.length;
    const cy = projected.reduce((s, p) => s + p.y, 0) / projected.length;
    expect(cx).toBeCloseTo(0, 1);
    expect(cy).toBeCloseTo(0, 1);
  });
});
