import type { LinearCalibration, Unit } from '../domain/types.js';
import { convertLengthToMeters } from '../measurement/unitConversion.js';

// docs/19_IMPORT_EXPORT.md §3 — "the missing piece": Calibration Establishment. Lives in Core
// (not Measurement Engine, which only *consumes* a ready Calibration — 17 §2 contract; not
// Drawing Engine, which only produces the reference-line geometry). A pure function, exactly
// like Measurement Engine (19 §3: "Не живее в Measurement Engine, защото Measurement Engine
// приема Calibration като готов вход, не го произвежда").
//
// Architecture: Drawing → CalibrationService → Calibration (VO) → Measurement Engine (PD-018 §1).

/** 15 §5 F2 step 3 — the user drew a reference line of `pixelDistance` (Surface space) and
 * declared it represents `realLength` real-world `unit`s. */
export function fromReferenceLine(pixelDistance: number, realLength: number, unit: Unit): LinearCalibration {
  if (pixelDistance <= 0) {
    throw new Error('fromReferenceLine: pixelDistance must be positive');
  }
  if (realLength <= 0) {
    throw new Error('fromReferenceLine: realLength must be positive');
  }
  const realLengthMeters = convertLengthToMeters(realLength, unit);
  return { kind: 'linear', metersPerPixel: realLengthMeters / pixelDistance };
}

// --- Sanity warning (US-033, 19 §3) — non-blocking plausibility check on the resulting scale. ---

export interface PlausibilityResult {
  readonly plausible: boolean;
  readonly impliedWidthMeters: number;
  readonly impliedHeightMeters: number;
}

/** Heuristic bounds are a Phase 4 implementation detail (19 §3: "прагът... не е продуктово") —
 * these defaults are a starting point, tunable without touching the Calibration model itself. */
const IMPLAUSIBLY_SMALL_METERS = 0.1; // e.g. a "surface" narrower than 10cm
const IMPLAUSIBLY_LARGE_METERS = 5_000; // e.g. a "room" wider than 5km

export function assessPlausibility(
  calibration: LinearCalibration,
  surfacePixelWidth: number,
  surfacePixelHeight: number,
): PlausibilityResult {
  const impliedWidthMeters = surfacePixelWidth * calibration.metersPerPixel;
  const impliedHeightMeters = surfacePixelHeight * calibration.metersPerPixel;
  const largest = Math.max(impliedWidthMeters, impliedHeightMeters);
  const smallest = Math.min(impliedWidthMeters, impliedHeightMeters);
  const plausible = largest <= IMPLAUSIBLY_LARGE_METERS && smallest >= IMPLAUSIBLY_SMALL_METERS;
  return { plausible, impliedWidthMeters, impliedHeightMeters };
}
