// PO request (dynamic calibrated scale bar) — pure selection algorithm, no rendering/DOM here
// (ScaleBar.svelte owns that). Picks a "human-friendly" real-world length (1-2-5 x 10^n
// progression, PO request) whose on-screen width lands in a target pixel range, given the
// current calibration + viewport zoom. Two independent ladders (metric: mm up through m;
// imperial: in up through ft) rather than one continuous unit-converting ladder — matches the
// PO's own example list, which never expresses a value like "0.1 m" when "100 mm" or a bigger
// nice mm value is available; the exact ladder boundary (mm vs m) is a judgment call, not a
// literal transcription of the PO's (non-exhaustive) example list.

export type UnitSystem = 'metric' | 'imperial';

export interface ScaleBarRangeConfig {
  readonly minPx: number;
  readonly maxPx: number;
}

/** PO's own suggested target range (§4: "target approximately 80-160 CSS pixels"). */
export const DEFAULT_SCALE_BAR_RANGE: ScaleBarRangeConfig = { minPx: 80, maxPx: 160 };

export interface ScaleBarResult {
  readonly widthPx: number;
  readonly label: string;
}

interface Candidate {
  readonly meters: number;
  readonly label: string;
}

const METERS_PER_INCH = 0.0254;
const METERS_PER_FOOT = 0.3048;

function metricCandidates(): Candidate[] {
  const mm = [1, 2, 5, 10, 20, 50, 100, 200, 500].map((v) => ({ meters: v / 1000, label: `${v} mm` }));
  const m = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].map((v) => ({ meters: v, label: `${v} m` }));
  return [...mm, ...m];
}

function imperialCandidates(): Candidate[] {
  const inches = [1, 2, 5, 10, 20, 50].map((v) => ({ meters: v * METERS_PER_INCH, label: `${v} in` }));
  const feet = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].map((v) => ({
    meters: v * METERS_PER_FOOT,
    label: `${v} ft`,
  }));
  return [...inches, ...feet];
}

function candidatesFor(system: UnitSystem): Candidate[] {
  return system === 'metric' ? metricCandidates() : imperialCandidates();
}

/**
 * `metersPerScreenPixel`: how many real-world meters one CSS pixel currently represents, i.e.
 * `calibration.metersPerPixel / viewport.scale` — the caller (ScaleBar.svelte) owns combining
 * those two, this function only ever needs the single combined ratio. Returns `null` for a
 * non-positive/non-finite ratio (nothing sensible to show — e.g. viewport not yet measured).
 *
 * Selection rule: among every candidate whose resulting screen width falls inside
 * `[range.minPx, range.maxPx]`, pick the largest (best use of the available target width, most
 * precise-looking bar). If none fall inside the range, pick the smallest candidate that's still
 * `>= minPx` (a readable value, just a narrower bar than ideal); if even that doesn't exist (every
 * candidate is too small — extreme zoom-out beyond the ladder's own range), fall back to the
 * single largest candidate available, which is the best any of them can do.
 */
export function chooseScaleBar(
  metersPerScreenPixel: number,
  system: UnitSystem,
  range: ScaleBarRangeConfig = DEFAULT_SCALE_BAR_RANGE,
): ScaleBarResult | null {
  if (!(metersPerScreenPixel > 0) || !Number.isFinite(metersPerScreenPixel)) return null;

  const withWidths = candidatesFor(system).map((c) => ({ ...c, widthPx: c.meters / metersPerScreenPixel }));

  const inRange = withWidths.filter((c) => c.widthPx >= range.minPx && c.widthPx <= range.maxPx);
  if (inRange.length > 0) {
    const best = inRange.reduce((a, b) => (b.widthPx > a.widthPx ? b : a));
    return { widthPx: best.widthPx, label: best.label };
  }

  const aboveMin = withWidths.filter((c) => c.widthPx >= range.minPx).sort((a, b) => a.widthPx - b.widthPx);
  if (aboveMin.length > 0) {
    const smallest = aboveMin[0]!;
    return { widthPx: smallest.widthPx, label: smallest.label };
  }

  const sorted = [...withWidths].sort((a, b) => b.widthPx - a.widthPx);
  const largest = sorted[0];
  return largest ? { widthPx: largest.widthPx, label: largest.label } : null;
}
