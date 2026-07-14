import type { Point } from '../domain/types.js';

// docs/17_MEASUREMENT_ENGINE.md §3/§4 — pure geometric formulas. No calibration/unit awareness here;
// that lives in measurementEngine.ts, which decides which formula set applies.

const EARTH_RADIUS_M = 6_371_000; // mean radius — 17 §4 rule 3: "пренебрегва елипсоидното сплескване"
const DEG_TO_RAD = Math.PI / 180;

function toRad(deg: number): number {
  return deg * DEG_TO_RAD;
}

export function euclideanDistance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** 17 §3.1 — planar Shoelace formula. Assumes a simple (non-self-intersecting) polygon,
 * a precondition Drawing Engine guarantees before handing off a Shape (18 §2). */
export function shoelaceArea(vertices: readonly Point[]): number {
  const n = vertices.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const p1 = vertices[i]!;
    const p2 = vertices[(i + 1) % n]!;
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(sum) / 2;
}

/** 17 §3.1 — sum of planar segment lengths around a closed polygon. */
export function polygonPerimeter(vertices: readonly Point[]): number {
  const n = vertices.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += euclideanDistance(vertices[i]!, vertices[(i + 1) % n]!);
  }
  return sum;
}

export function segmentLengths(vertices: readonly Point[]): number[] {
  const n = vertices.length;
  const lengths: number[] = [];
  for (let i = 0; i < n; i++) {
    lengths.push(euclideanDistance(vertices[i]!, vertices[(i + 1) % n]!));
  }
  return lengths;
}

/** 17 §3.4 — interior angle at each vertex, via atan2 (numerically stable across quadrants,
 * unlike acos on a dot product). Reflex vertices (non-convex polygons, e.g. Split results,
 * 18 §5) correctly report angles > π. */
export function interiorAngles(vertices: readonly Point[]): number[] {
  const n = vertices.length;
  if (n < 3) return [];

  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const p1 = vertices[i]!;
    const p2 = vertices[(i + 1) % n]!;
    signedArea += p1.x * p2.y - p2.x * p1.y;
  }
  const ccw = signedArea > 0;

  return vertices.map((curr, i) => {
    const prev = vertices[(i - 1 + n) % n]!;
    const next = vertices[(i + 1) % n]!;
    const v1x = prev.x - curr.x;
    const v1y = prev.y - curr.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const cross = v1x * v2y - v1y * v2x;
    const dot = v1x * v2x + v1y * v2y;
    const unsigned = Math.atan2(Math.abs(cross), dot); // (0, π]
    // `cross` here is (prev-curr) × (next-curr) — the negation of the standard edge-turn cross
    // product (curr-prev) × (next-curr). A CCW polygon's convex (left) turns have a *positive*
    // edge-turn cross, so `cross` (its negation) is negative at convex vertices and positive at
    // reflex ones — hence `cross > 0` selects reflex for a CCW polygon.
    const isReflex = ccw ? cross > 0 : cross < 0;
    return isReflex ? 2 * Math.PI - unsigned : unsigned;
  });
}

// --- Geo (Map surface) formulas — 17 §4. Point.x = longitude, Point.y = latitude, degrees. ---

/** 17 §4 rule 4 — great-circle distance. Correct for arbitrary length, unlike planar distance. */
export function haversineDistanceMeters(a: Point, b: Point): number {
  const lat1 = toRad(a.y);
  const lat2 = toRad(b.y);
  const dLat = toRad(b.y - a.y);
  const dLng = toRad(b.x - a.x);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 17 §4 rule 2 — local tangent-plane (equirectangular) projection centered at the vertex
 * centroid: x = R·cos(lat0)·Δlng, y = R·Δlat. Valid for small-to-medium polygons (parcels,
 * yards, roofs); accumulates error for large/elongated shapes — see LARGE_AREA_THRESHOLD_M2. */
export function projectToLocalTangentPlane(verticesLatLng: readonly Point[]): Point[] {
  const n = verticesLatLng.length;
  const lat0 = toRad(verticesLatLng.reduce((s, p) => s + p.y, 0) / n);
  const lng0 = toRad(verticesLatLng.reduce((s, p) => s + p.x, 0) / n);
  const cosLat0 = Math.cos(lat0);
  return verticesLatLng.map((p) => ({
    x: EARTH_RADIUS_M * cosLat0 * (toRad(p.x) - lng0),
    y: EARTH_RADIUS_M * (toRad(p.y) - lat0),
  }));
}

/** 17 §4 rule 3 — spherical excess polygon area (Chamberlain & Duquette method), exact for a
 * sphere (ignores ellipsoidal flattening, <0.1% error for typical parcels). Used as fallback
 * for polygons too large/elongated for the tangent-plane approximation to stay accurate. */
export function sphericalExcessArea(verticesLatLng: readonly Point[]): number {
  const n = verticesLatLng.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const prevLng = toRad(verticesLatLng[(i - 1 + n) % n]!.x);
    const nextLng = toRad(verticesLatLng[(i + 1) % n]!.x);
    const lat = toRad(verticesLatLng[i]!.y);
    sum += (nextLng - prevLng) * Math.sin(lat);
  }
  return (Math.abs(sum) * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2;
}

/** 17 §4 rule 3 — the threshold at which geo area computation switches from tangent-plane
 * projection to the spherical-excess formula. ~5 km², per the documented policy. */
export const LARGE_AREA_THRESHOLD_M2 = 5_000_000;

/** 17 §4 — the single entry point for geo polygon area. Never apply shoelaceArea directly to
 * raw lat/lng (17 §4: "никога плоска формула директно върху суров lat/lng" — the hard guardrail
 * this function exists to enforce). */
export function computeGeoPolygonArea(verticesLatLng: readonly Point[]): number {
  const projected = projectToLocalTangentPlane(verticesLatLng);
  const tangentPlaneArea = shoelaceArea(projected);
  if (tangentPlaneArea <= LARGE_AREA_THRESHOLD_M2) {
    return tangentPlaneArea;
  }
  return sphericalExcessArea(verticesLatLng);
}

/** 17 §4 rule 4 applied to a closed ring — geo perimeter via haversine segments. */
export function geoPolygonPerimeter(verticesLatLng: readonly Point[]): number {
  const n = verticesLatLng.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += haversineDistanceMeters(verticesLatLng[i]!, verticesLatLng[(i + 1) % n]!);
  }
  return sum;
}

// --- Parametric-shape helpers (Rectangle/Circle → point lists, for reuse of polygon formulas) ---

export function rectangleCorners(origin: Point, width: number, height: number, rotation: number): Point[] {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const local: readonly Point[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  return local.map(({ x, y }) => ({
    x: origin.x + x * cos - y * sin,
    y: origin.y + x * sin + y * cos,
  }));
}

export function circlePolygon(center: Point, radius: number, segments = 64): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < segments; i++) {
    const theta = (2 * Math.PI * i) / segments;
    points.push({ x: center.x + radius * Math.cos(theta), y: center.y + radius * Math.sin(theta) });
  }
  return points;
}
