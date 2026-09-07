import { compute, lengthUnitFor } from '../../core/measurement/measurementEngine.js';
import { roundForDisplay, type PrecisionContext } from '../../core/measurement/precision.js';
import { convertAreaFromMeters, convertLengthToMeters } from '../../core/measurement/unitConversion.js';
import { shoelaceArea } from '../../core/measurement/formulas.js';
import type { Calibration, MeasurementValues, Point, Shape, Unit } from '../../core/domain/types.js';

// UI-layer formatting on top of the two pure Core modules (17 §2 compute, §5 precision) — this
// file contains no geometry/measurement math of its own, only display concerns (label text,
// unit suffixes). Linear (Image/PDF) calibration is wired since the Calibration UI slice
// (`calibrationSession.ts`); the geo branch is still written for forward-compatibility with
// Core's actual contract, not exercised by any UI flow yet (no Map surfaces).

export interface MeasurementDisplay {
  readonly values: MeasurementValues;
  /** area for closed shapes, length for open ones (Line) — whichever compute() actually populated */
  readonly primaryLabel: string;
}

function areaUnitLabel(unit: Unit): string {
  switch (unit) {
    case 'px':
      return 'px²';
    case 'mm2':
      return 'mm²';
    case 'cm2':
      return 'cm²';
    case 'm2':
      return 'm²';
    case 'in2':
      return 'in²';
    case 'ft2':
      return 'ft²';
    case 'ha':
      return 'ha';
    case 'acre':
      return 'ac';
    default:
      return unit;
  }
}

// QA fix — `values.unit` for a Polygon is always the AREA unit (e.g. 'm2'), even when labeling
// the paired Perimeter/length field (measurementEngine.ts's convertFromBaseUnit sets `unit =
// toUnit` whenever `values.area` is defined) — echoing it verbatim produced "80 m2" instead of
// "80 m" for any calibrated Polygon's Perimeter row. `lengthUnitFor` already has the correct
// area-unit -> paired-length-unit mapping (mm2->mm, cm2->cm, in2->in, ft2->ft, else->m); routing
// through it here keeps this the single place that decides a length's displayed suffix.
function lengthUnitLabel(unit: Unit): string {
  return unit === 'px' ? 'px' : lengthUnitFor(unit);
}

// PO follow-up (UX review, item B2 "thousands separators") — every displayed value already
// passes through `roundForDisplay` (precision.ts, <=2 decimals), so this only adds grouping
// separators on top; `maximumFractionDigits: 3` is a belt-and-suspenders cap, not an actual
// rounding change (values arriving here already carry <=2 decimals). Locale pinned to 'en-US'
// rather than left to the runtime's default — deterministic output (tests, screenshots, support
// tickets) beats auto-detecting the user's OS locale for a v1 with no other localization anyway.
const displayNumberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

function formatNumber(value: number): string {
  return displayNumberFormat.format(value);
}

// PO request (expanded unit system) — decimal places per unit, roughly matching the "sensible
// precision per unit and magnitude" examples (12 m / 12.4 m / 124 cm / 1240 mm / 8 ft / 8.25 ft):
// sub-millimetre precision is never meaningful for hand-drawn/calibrated measurements, so mm/cm2
// round to whole numbers; m/ft keep the pre-existing 2-decimal cap; in gets 1 (matches the ft
// example's "8.25 ft" — 2 decimals — while inches, being a finer unit than feet, read better with
// 1). `roundForDisplay` (precision.ts) already clamps to `Math.min(calibrationDecimals, 2)`, so
// passing anything <= 2 here is always respected exactly.
function precisionContextFor(unit: Unit): PrecisionContext {
  if (unit === 'px') return { kind: 'px' };
  const decimals = unit === 'mm' || unit === 'mm2' || unit === 'cm' || unit === 'cm2' ? 0 : unit === 'in' || unit === 'in2' ? 1 : 2;
  return { kind: 'linear', calibrationDecimals: decimals };
}

export function computeMeasurementDisplay(shape: Shape, calibration: Calibration, requestedUnit: Unit = 'm2'): MeasurementDisplay {
  const values = compute(shape, calibration, requestedUnit);
  const ctx = precisionContextFor(values.unit);

  if (values.area !== undefined) {
    const rounded = roundForDisplay(values.area, ctx);
    return { values, primaryLabel: `${formatNumber(rounded)} ${areaUnitLabel(values.unit)}` };
  }
  if (values.length !== undefined) {
    const rounded = roundForDisplay(values.length, ctx);
    return { values, primaryLabel: `${formatNumber(rounded)} ${lengthUnitLabel(values.unit)}` };
  }
  return { values, primaryLabel: '' };
}

/** PO request (manual area) — overrides `display.values.area`/`primaryLabel` with a Measurement's
 * explicit `manualArea` scale factor (entities.ts), leaving every other field (perimeter, vertex
 * count, etc.) untouched — manual area is "separate from geometrically calculated area," not a
 * wholesale replacement of the Values section. Recomputes from the shape's *current* vertices
 * every call (not a cached number), which is what makes a manually-set area track proportionally
 * through later geometry edits instead of going stale — the same mechanism Split's children rely
 * on (application/commands/splitIntoParts.ts). A no-op (returns `display` unchanged) when
 * `manualArea` is `undefined`, so ordinary geometry/calibration-derived Measurements are
 * unaffected. Only meaningful for Polygon (`vertices`); `null`-safe for anything else. */
export function applyManualArea(
  display: MeasurementDisplay,
  manualArea: { readonly squareMetersPerSquarePixel: number } | undefined,
  vertices: readonly Point[] | undefined,
  requestedUnit: Unit,
): MeasurementDisplay {
  if (!manualArea || !vertices) return display;
  const geometricAreaPx = shoelaceArea(vertices);
  const areaM2 = geometricAreaPx * manualArea.squareMetersPerSquarePixel;
  const unit = requestedUnit === 'px' ? 'm2' : requestedUnit; // manual area is always a real-world m² reference, never px
  const areaInUnit = convertAreaFromMeters(areaM2, unit);
  const ctx = precisionContextFor(unit);
  const rounded = roundForDisplay(areaInUnit, ctx);
  return {
    values: { ...display.values, area: areaInUnit, unit },
    primaryLabel: `${formatNumber(rounded)} ${areaUnitLabel(unit)}`,
  };
}

/** PropertyPanel's Values section (16 §3.2) needs perimeter formatted *alongside* an area
 * primaryLabel — `computeMeasurementDisplay` only ever surfaces one of area/length as the
 * primary label, so this reuses the same precision/unit-label rules for the secondary field
 * instead of duplicating them. */
export function formatLengthValue(length: number, unit: Unit): string {
  const ctx = precisionContextFor(unit);
  const rounded = roundForDisplay(length, ctx);
  return `${formatNumber(rounded)} ${lengthUnitLabel(unit)}`;
}

/** PO request (expanded unit system, §8: "one centralized formatting/conversion service") — a
 * total-area sum (MeasurementList.svelte's footer) is exactly as much an "already-in-unit" number
 * as `formatLengthValue`'s perimeter is; giving it the same treatment here means the footer and
 * every per-row label round/label an area exactly the same way, rather than the footer
 * maintaining its own inline suffix/rounding logic that quietly drifts (found live: the footer
 * previously showed literal "1076 ft2" while every row/chip/panel showed "1076.39 ft²"). */
export function formatAreaValue(area: number, unit: Unit): string {
  const ctx = precisionContextFor(unit);
  const rounded = roundForDisplay(area, ctx);
  return `${formatNumber(rounded)} ${areaUnitLabel(unit)}`;
}

// PO follow-up ("numeric input fields for dimensions") — PropertyPanel's Rectangle width/height
// and Circle radius fields, typed directly instead of dragged. Three helpers mirroring the
// existing one-way format pipeline above, plus its inverse (typed text -> Surface-space px).

/** The unit Rectangle/Circle `width`/`height`/`radius` fields (MeasurementValues) actually end up
 * in for a given displayUnit — `null` calibration is always raw Surface-space px regardless of
 * displayUnit (measurementEngine.ts's computeUncalibrated ignores the requested unit entirely);
 * linear calibration uses the length unit paired with the (always area-only) displayUnit
 * preference, the same mapping compute() already applies internally to these fields. */
export function dimensionUnitFor(calibration: Calibration, displayUnit: Unit): Unit {
  return calibration === null ? 'px' : lengthUnitFor(displayUnit);
}

/** Unit-suffix-free rounded string for an editable numeric input's draft value — same rounding as
 * formatLengthValue, just without the label (the input's own unit is shown alongside it, not
 * inline in the value). */
export function formatDimensionDraft(value: number, unit: Unit): string {
  const ctx = precisionContextFor(unit);
  return formatNumber(roundForDisplay(value, ctx));
}

/** Inverse of the display pipeline: a typed dimension (already in `dimensionUnitFor`'s unit) back
 * to Surface-space px, ready for resizeRectangleDimensionsCommand/resizeCircleToRadiusCommand.
 * `null` for an unusable input (blank/non-numeric/non-positive — the commands themselves would
 * throw on a non-positive px value anyway, but catching it here lets the field revert cleanly
 * without pushing a doomed command) or a Geo calibration (no Surface-space px to convert into —
 * no numeric-dimension UI is offered for Map surfaces, computeMeasurementDisplay's own header). */
export function parseDimensionToPx(text: string, calibration: Calibration, displayUnit: Unit): number | null {
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (calibration === null) return value;
  if (calibration.kind === 'geo') return null;
  return convertLengthToMeters(value, lengthUnitFor(displayUnit)) / calibration.metersPerPixel;
}
