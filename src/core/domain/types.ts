// Domain types — direct translation of docs/14_DOMAIN_MODEL.md §3.
// Core has zero dependency on UI/Application/Adapters (21_ARCHITECTURE §1/§3),
// enforced by eslint.config.js boundaries rules, not just this comment.

/**
 * A point in Surface space (18_DRAWING_ENGINE §3), never screen space.
 * For Image/PDF surfaces: (x, y) in surface-local units (px until calibrated).
 * For Map surfaces: x = longitude, y = latitude (18_DRAWING_ENGINE §3.3).
 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

// PO request (expanded unit system) — mm/cm added alongside the existing m (metric) and in added
// alongside ft (imperial), plus their area counterparts. 'px' remains the uncalibrated-mode unit
// (17 §7); 'ha'/'acre' are unchanged, larger-scale area units. The area unit is always what a
// caller actually requests from MeasurementEngine.compute() (17 §2) — the paired *length* unit
// (mm/cm/m/in/ft) is derived internally (`lengthUnitFor`, measurementEngine.ts) for
// perimeter/segment/radius fields, never passed as `unit` directly for an area-producing Shape.
export type Unit = 'px' | 'mm' | 'cm' | 'm' | 'in' | 'ft' | 'mm2' | 'cm2' | 'm2' | 'in2' | 'ft2' | 'ha' | 'acre';

// --- Shape (Value Object, 14 §3): replaced wholesale on every edit, never mutated in place. ---

export interface PolygonShape {
  readonly type: 'polygon';
  readonly vertices: readonly Point[];
}

export interface RectangleShape {
  readonly type: 'rectangle';
  readonly origin: Point;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}

export interface CircleShape {
  readonly type: 'circle';
  readonly center: Point;
  readonly radius: number;
}

export interface CurveShape {
  readonly type: 'curve';
  readonly controlPoints: readonly Point[];
  readonly closed: boolean;
}

export interface FreehandShape {
  readonly type: 'freehand';
  readonly points: readonly Point[];
  readonly closed: boolean;
}

export interface LineShape {
  readonly type: 'line';
  readonly from: Point;
  readonly to: Point;
}

export type Shape =
  | PolygonShape
  | RectangleShape
  | CircleShape
  | CurveShape
  | FreehandShape
  | LineShape;

// --- Calibration (Value Object, 14 §3): the scale truth of a Surface. Replaced wholesale on recalibration. ---

/** Image/PDF surface: a linear px-to-real-world scale established via CalibrationService (19 §3). */
export interface LinearCalibration {
  readonly kind: 'linear';
  /** meters per one Surface-space unit (px) — internal base unit is always meters (17 §7). */
  readonly metersPerPixel: number;
}

/** Map surface: born-calibrated (11 §6) — coordinates are already geographic (lat/lng). */
export interface GeoCalibration {
  readonly kind: 'geo';
}

/** null = uncalibrated (px mode, 11 §6 Surface state Uncalibrated). A valid, non-error input (17 §2). */
export type Calibration = LinearCalibration | GeoCalibration | null;

// --- Provenance (Value Object, immutable after Measurement creation — INV-6, 14 §3/§4) ---

export type Provenance = 'Manual' | 'AIGenerated';

// --- MeasurementValues (Value Object, 17 §2): pure output of MeasurementEngine.compute(). ---
// All fields are always present for shapes where they apply; unit is always present.
// Precision/rounding is a display-layer concern (17 §5) — these are full float64 values.

export interface MeasurementValues {
  readonly unit: Unit;
  readonly area?: number;
  readonly perimeter?: number;
  readonly length?: number;
  readonly vertexCount?: number;
  readonly segmentLengths?: readonly number[];
  /** interior angles in radians, computed via atan2 (17 §3.4) */
  readonly interiorAngles?: readonly number[];
  readonly radius?: number;
  readonly diameter?: number;
  readonly width?: number;
  readonly height?: number;
}

// --- Result type (23 §2.1/§8): normal, user-reachable "failure" outcomes are values, not exceptions. ---

export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: E };

export function ok<T, E = never>(value: T): Result<T, E> {
  return { ok: true, value };
}

export function fail<E, T = never>(reason: E): Result<T, E> {
  return { ok: false, reason };
}
