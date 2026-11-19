import { convertLengthFromMeters } from '../../core/measurement/unitConversion.js';
import type { Calibration, Unit } from '../../core/domain/types.js';

// Extracted from StatusBar.svelte's own formatScale/lengthUnitLabel (grilling 2026-11-19, export
// feature Q4) — the exported picture's scale caption must read exactly the same as the live
// ScaleChip, so this is now the one place that decides that text, imported by both rather than
// two copies quietly drifting apart.

function lengthUnitLabel(unit: Unit): string {
  if (unit === 'mm2') return 'mm';
  if (unit === 'cm2') return 'cm';
  if (unit === 'in2') return 'in';
  if (unit === 'ft2') return 'ft';
  return 'm';
}

export function formatScale(metersPerPixel: number, unit: Unit): string {
  const label = lengthUnitLabel(unit);
  const converted = convertLengthFromMeters(metersPerPixel, label as Unit);
  const trimmed = converted.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  return `1 px = ${trimmed} ${label}`;
}

/** `null` (geo Surfaces, not reachable yet — no Map surfaces exist) for a calibration that has no
 * meaningful scale text — same "doesn't render" fallback StatusBar.svelte's own `scaleLabel`
 * reactive already has for that case. */
export function scaleCaptionText(calibration: Calibration, unit: Unit): string | null {
  if (calibration === null) return 'Not calibrated';
  if (calibration.kind === 'linear') return formatScale(calibration.metersPerPixel, unit);
  return null;
}
