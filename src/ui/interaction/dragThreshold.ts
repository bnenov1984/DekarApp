// PO follow-up ("unify object selection and edit state") — a single click on a shape now both
// selects it AND is a valid starting point for a drag (move/resize/vertex-edit) in the same
// gesture; distinguishing "the user just clicked" from "the user is dragging" needs a real
// click-vs-drag threshold where none existed before (previously, dragging only ever started on
// the *second* click of a double-click, never the first). Screen-space (client coordinates), not
// world/Surface-space, so the felt "did my mouse actually move" threshold stays constant
// regardless of zoom — same reasoning CanvasStage.svelte's own SELECT_HIT_TOLERANCE_SCREEN_PX
// already documents for its hit-test tolerances.

export const DRAG_THRESHOLD_SCREEN_PX = 4;

export function exceedsDragThreshold(
  startClientX: number,
  startClientY: number,
  currentClientX: number,
  currentClientY: number,
  thresholdPx: number = DRAG_THRESHOLD_SCREEN_PX,
): boolean {
  const dx = currentClientX - startClientX;
  const dy = currentClientY - startClientY;
  return Math.hypot(dx, dy) > thresholdPx;
}
