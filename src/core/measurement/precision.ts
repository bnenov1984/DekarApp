// docs/17_MEASUREMENT_ENGINE.md §5 — "честна прецизност, не фалшива": the number of
// significant digits follows the scale of the *input*, not float64's capacity.
//
// This is a display/export-layer concern (17 §5: "закръглянето е само на изхода; вътрешните
// изчисления винаги в пълна float64 прецизност") — measurementEngine.compute() never rounds.
// Callers apply roundForDisplay() when formatting a value for UI or Report generation.

export type PrecisionContext =
  | { readonly kind: 'px' }
  | { readonly kind: 'geo' }
  | { readonly kind: 'linear'; readonly calibrationDecimals: number };

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** 17 §5 row "px режим" — whole pixels, never fractional; an uncalibrated value never claims
 * precision it doesn't have. */
export function roundForDisplay(value: number, context: PrecisionContext, isSmallObject = false): number {
  switch (context.kind) {
    case 'px':
      return Math.round(value);
    case 'geo':
      // 17 §5 rows "Map" / "малки обекти": satellite resolution doesn't justify sub-meter
      // precision except for genuinely small areas, where 1–2 decimals stays meaningful.
      return isSmallObject ? roundTo(value, 2) : roundTo(value, 1);
    case 'linear':
      // 17 §5 row "ръчно календрирана Surface": never show more decimals than the calibration
      // itself was set with — precision cannot exceed the precision of the scale it's built on.
      return roundTo(value, Math.min(context.calibrationDecimals, 2));
  }
}
