import type { Calibration, MeasurementValues, Shape, Unit } from '../domain/types.js';
import {
  circlePolygon,
  computeGeoPolygonArea,
  euclideanDistance,
  geoPolygonPerimeter,
  haversineDistanceMeters,
  interiorAngles,
  polygonPerimeter,
  projectToLocalTangentPlane,
  rectangleCorners,
  segmentLengths,
  shoelaceArea,
} from './formulas.js';
import { convertAreaFromMeters, convertLengthFromMeters } from './unitConversion.js';

// docs/17_MEASUREMENT_ENGINE.md §2 — the engine's whole contract:
//   compute(shape, calibration, unit) → MeasurementValues
// A pure, total function for every valid Shape (18 §2 guarantees validity upstream). Never
// throws, never has side effects, never reads anything but its three arguments (17 §1: "входът
// е винаги само (Shape, Calibration, [unit]), нищо друго не се подава").

/**
 * Curve/Freehand are computed as a polyline through their raw point arrays (controlPoints /
 * points respectively). This is a documented v1 simplification: 18 §2 specifies the Shape as
 * "Bézier/сплайн" without pinning down segment interpolation, so true arc-length integration
 * over interpolated curve geometry is deferred — the point array itself is already what the
 * Drawing Engine produces as the user drags, so treating it as a polyline is correct today and
 * safe to refine later without changing this function's contract (17 §3.3 anticipates this:
 * "адаптивна дискретизация" — the discretization is simply performed upstream for now).
 */

export function compute(shape: Shape, calibration: Calibration, unit: Unit): MeasurementValues {
  if (calibration === null) {
    return computeUncalibrated(shape);
  }
  if (calibration.kind === 'geo') {
    return computeGeo(shape, unit);
  }
  return computeLinear(shape, calibration.metersPerPixel, unit);
}

// --- px mode (11 §6 "Uncalibrated") — raw Surface-space units, unit is always forced to 'px'. ---

function computeUncalibrated(shape: Shape): MeasurementValues {
  const raw = computePlanar(shape);
  return { ...raw, unit: 'px' };
}

// --- Linear (Image/PDF) — planar geometry scaled by metersPerPixel, then converted to `unit`. ---

function computeLinear(shape: Shape, metersPerPixel: number, unit: Unit): MeasurementValues {
  const raw = computePlanar(shape); // in px
  const scaled: MeasurementValues = {
    unit: 'm', // internal base unit (17 §7) before final conversion below
    ...(raw.area !== undefined && { area: raw.area * metersPerPixel * metersPerPixel }),
    ...(raw.perimeter !== undefined && { perimeter: raw.perimeter * metersPerPixel }),
    ...(raw.length !== undefined && { length: raw.length * metersPerPixel }),
    ...(raw.vertexCount !== undefined && { vertexCount: raw.vertexCount }),
    ...(raw.segmentLengths !== undefined && {
      segmentLengths: raw.segmentLengths.map((l) => l * metersPerPixel),
    }),
    ...(raw.interiorAngles !== undefined && { interiorAngles: raw.interiorAngles }), // angle-invariant under uniform scale
    ...(raw.radius !== undefined && { radius: raw.radius * metersPerPixel }),
    ...(raw.diameter !== undefined && { diameter: raw.diameter * metersPerPixel }),
    ...(raw.width !== undefined && { width: raw.width * metersPerPixel }),
    ...(raw.height !== undefined && { height: raw.height * metersPerPixel }),
  };
  return convertFromBaseUnit(scaled, unit);
}

// --- Geo (Map) — 17 §4: never plain shoelace on raw lat/lng. Vertices are already (lng, lat). ---

function computeGeo(shape: Shape, unit: Unit): MeasurementValues {
  switch (shape.type) {
    case 'polygon':
      return convertFromBaseUnit(geoPolygonValues(shape.vertices), unit);
    case 'rectangle': {
      const corners = rectangleCorners(shape.origin, shape.width, shape.height, shape.rotation);
      return convertFromBaseUnit(geoPolygonValues(corners), unit);
    }
    case 'circle': {
      // Edge case, not exercised by any documented F1–F7 flow (Polygon is the primary parcel
      // tool on Map surfaces, 09 journeys). Judgment call: `radius` is interpreted as meters,
      // converted to a local degree-radius at the circle's own latitude before discretizing.
      const metersPerDegLat = 111_320; // ~constant; good enough for a discretization radius
      const metersPerDegLng = 111_320 * Math.cos((shape.center.y * Math.PI) / 180);
      const radiusDeg = { x: shape.radius / metersPerDegLng, y: shape.radius / metersPerDegLat };
      const poly = circlePolygon(shape.center, 1, 64).map((p) => ({
        x: shape.center.x + (p.x - shape.center.x) * radiusDeg.x,
        y: shape.center.y + (p.y - shape.center.y) * radiusDeg.y,
      }));
      const values = geoPolygonValues(poly);
      return convertFromBaseUnit({ ...values, radius: shape.radius, diameter: shape.radius * 2 }, unit);
    }
    case 'curve':
    case 'freehand': {
      const pts = shape.type === 'curve' ? shape.controlPoints : shape.points;
      if (shape.closed && pts.length >= 3) {
        return convertFromBaseUnit(geoPolygonValues(pts), unit);
      }
      return convertFromBaseUnit(
        { unit: 'm', perimeter: geoPolygonPerimeterOpen(pts), vertexCount: pts.length },
        unit,
      );
    }
    case 'line':
      return convertFromBaseUnit(
        { unit: 'm', length: haversineDistanceMeters(shape.from, shape.to) },
        unit,
      );
  }
}

function geoPolygonValues(vertices: readonly { x: number; y: number }[]): MeasurementValues {
  const projected = projectToLocalTangentPlane(vertices);
  return {
    unit: 'm',
    area: computeGeoPolygonArea(vertices),
    perimeter: geoPolygonPerimeter(vertices),
    vertexCount: vertices.length,
    segmentLengths: segmentLengthsGeo(vertices),
    interiorAngles: interiorAngles(projected), // angles computed on the local projection (17 §4 note)
  };
}

function segmentLengthsGeo(vertices: readonly { x: number; y: number }[]): number[] {
  const n = vertices.length;
  const lengths: number[] = [];
  for (let i = 0; i < n; i++) {
    lengths.push(haversineDistanceMeters(vertices[i]!, vertices[(i + 1) % n]!));
  }
  return lengths;
}

function geoPolygonPerimeterOpen(vertices: readonly { x: number; y: number }[]): number {
  let sum = 0;
  for (let i = 0; i < vertices.length - 1; i++) {
    sum += haversineDistanceMeters(vertices[i]!, vertices[i + 1]!);
  }
  return sum;
}

// --- Planar dispatch shared by px-mode and linear-mode (both operate on raw Shape coordinates). ---

function computePlanar(shape: Shape): MeasurementValues {
  switch (shape.type) {
    case 'polygon':
      return {
        unit: 'px',
        area: shoelaceArea(shape.vertices),
        perimeter: polygonPerimeter(shape.vertices),
        vertexCount: shape.vertices.length,
        segmentLengths: segmentLengths(shape.vertices),
        interiorAngles: interiorAngles(shape.vertices),
      };
    case 'rectangle':
      return {
        unit: 'px',
        area: shape.width * shape.height,
        perimeter: 2 * (shape.width + shape.height),
        width: shape.width,
        height: shape.height,
      };
    case 'circle':
      return {
        unit: 'px',
        area: Math.PI * shape.radius * shape.radius,
        perimeter: 2 * Math.PI * shape.radius,
        radius: shape.radius,
        diameter: shape.radius * 2,
      };
    case 'line':
      return {
        unit: 'px',
        length: euclideanDistance(shape.from, shape.to),
      };
    case 'curve':
    case 'freehand': {
      const pts = shape.type === 'curve' ? shape.controlPoints : shape.points;
      if (shape.closed && pts.length >= 3) {
        return {
          unit: 'px',
          area: shoelaceArea(pts),
          perimeter: polygonPerimeter(pts),
          vertexCount: pts.length,
        };
      }
      let length = 0;
      for (let i = 0; i < pts.length - 1; i++) length += euclideanDistance(pts[i]!, pts[i + 1]!);
      return { unit: 'px', length, vertexCount: pts.length };
    }
  }
}

// --- Final unit conversion (17 §7): base unit (meters) → requested display unit. ---

function convertFromBaseUnit(values: MeasurementValues, toUnit: Unit): MeasurementValues {
  if (toUnit === 'px') return values; // px-mode values are never converted
  // `unit` must reflect the unit the numeric fields actually end up in, not just echo `toUnit`
  // verbatim — a length-only Shape (Line) never gets an `area` field, so it's never actually in
  // the *area* unit `toUnit` names; it's in that unit's paired length unit (lengthUnitFor). Fixed
  // alongside the mm/cm/in addition since it was already a latent bug for ft2 (a Line measured
  // with toUnit='ft2' previously reported `unit: 'ft2'` while `length` was in feet).
  const unit = values.area !== undefined ? toUnit : lengthUnitFor(toUnit);
  return {
    ...values,
    unit,
    ...(values.area !== undefined && { area: convertAreaFromMeters(values.area, toUnit) }),
    ...(values.perimeter !== undefined && {
      perimeter: convertLengthFromMeters(values.perimeter, lengthUnitFor(toUnit)),
    }),
    ...(values.length !== undefined && {
      length: convertLengthFromMeters(values.length, lengthUnitFor(toUnit)),
    }),
    ...(values.segmentLengths !== undefined && {
      segmentLengths: values.segmentLengths.map((l) => convertLengthFromMeters(l, lengthUnitFor(toUnit))),
    }),
    ...(values.radius !== undefined && { radius: convertLengthFromMeters(values.radius, lengthUnitFor(toUnit)) }),
    ...(values.diameter !== undefined && {
      diameter: convertLengthFromMeters(values.diameter, lengthUnitFor(toUnit)),
    }),
    ...(values.width !== undefined && { width: convertLengthFromMeters(values.width, lengthUnitFor(toUnit)) }),
    ...(values.height !== undefined && { height: convertLengthFromMeters(values.height, lengthUnitFor(toUnit)) }),
  };
}

/** An area unit request (e.g. 'ha') still needs a *length* unit for perimeter/segments — this
 * maps each area unit to its natural linear counterpart (PO request, expanded unit system: mm²→mm,
 * cm²→cm, in²→in, ft²→ft; m²/ha/acre and every plain length unit otherwise fall through to 'm'/
 * itself). A pure length unit passported straight through (e.g. 'mm2' isn't literally 'mm', but
 * 'mm' itself maps to 'mm' via the final `return unit` — this function is only ever *called* with
 * whatever `toUnit` `compute()` received, area or length alike). */
export function lengthUnitFor(unit: Unit): Unit {
  if (unit === 'mm2') return 'mm';
  if (unit === 'cm2') return 'cm';
  if (unit === 'in2') return 'in';
  if (unit === 'ft2' || unit === 'ft') return 'ft';
  if (unit === 'mm' || unit === 'cm' || unit === 'in') return unit;
  return 'm';
}
