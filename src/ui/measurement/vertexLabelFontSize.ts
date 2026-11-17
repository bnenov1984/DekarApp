// PO request (vertex label size, grilling session 2026-11-18) — `VertexLabel.fontSize` (entities.ts)
// stores a 1-10 discrete level, never a raw px value, so this one mapping function is the single
// place that decides what each level actually looks like. 8px-24px: small enough to stay compact
// at level 1, roughly double the pre-existing fixed 12px at level 10 — level 1 is still legible,
// unlike a literal "1px" reading of the feature request.

export const VERTEX_LABEL_FONT_SIZE_LEVELS = 10;
const VERTEX_LABEL_FONT_SIZE_MIN_PX = 8;
const VERTEX_LABEL_FONT_SIZE_MAX_PX = 24;
/** The fixed size every vertex label rendered at before this feature existed — `fontSize:
 * undefined` keeps rendering at exactly this, so nothing already on a Surface visually changes. */
export const VERTEX_LABEL_DEFAULT_FONT_SIZE_PX = 12;

/** `level` is clamped and rounded to a valid 1-10 integer before mapping, so a corrupt/out-of-range
 * stored value can never produce an unreadable or negative font-size — same defensive-clamp
 * discipline as `vertexHandleRadius` (sceneRenderer.ts) applies to its own screen-space constant. */
export function vertexLabelFontSizePx(level: number | undefined): number {
  if (level === undefined) return VERTEX_LABEL_DEFAULT_FONT_SIZE_PX;
  const clamped = Math.min(VERTEX_LABEL_FONT_SIZE_LEVELS, Math.max(1, Math.round(level)));
  const step = (VERTEX_LABEL_FONT_SIZE_MAX_PX - VERTEX_LABEL_FONT_SIZE_MIN_PX) / (VERTEX_LABEL_FONT_SIZE_LEVELS - 1);
  return VERTEX_LABEL_FONT_SIZE_MIN_PX + (clamped - 1) * step;
}

/** The slider's initial position for a label that has never had an explicit size set — whichever
 * of the 10 levels maps closest to the pre-existing fixed 12px, so opening the size control for
 * the first time on an old label doesn't show a value that visually contradicts what's rendered. */
export function defaultVertexLabelFontSizeLevel(): number {
  let best = 1;
  let bestDiff = Infinity;
  for (let level = 1; level <= VERTEX_LABEL_FONT_SIZE_LEVELS; level++) {
    const diff = Math.abs(vertexLabelFontSizePx(level) - VERTEX_LABEL_DEFAULT_FONT_SIZE_PX);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = level;
    }
  }
  return best;
}
