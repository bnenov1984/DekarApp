import type { Measurement, Surface } from '../../core/domain/entities.js';
import type { Unit } from '../../core/domain/types.js';
import { shapeBounds, unionBounds, type Bounds } from '../../core/drawing/bounds.js';
import { shapeCentroid } from '../../core/drawing/centroid.js';
import { effectiveImageRect } from '../stores/imageResizeSession.js';
import { drawMeasurements, resizeHandlePoints } from '../rendering/sceneRenderer.js';
import { applyManualArea, computeMeasurementDisplay } from '../measurement/computeDisplay.js';
import { computePolygonEdgeLabels, EDGE_LABEL_INWARD_OFFSET_PX } from '../measurement/edgeLabels.js';
import { vertexLabelFontSizePx } from '../measurement/vertexLabelFontSize.js';
import { scaleCaptionText } from '../measurement/scaleLabel.js';
import { wrapJpegInPdf } from './pdfWrap.js';

// Grilling 2026-11-19 ("export PDF/JPEG/PNG, like a screenshot, respecting hidden layers") —
// reuses the rendering layer (sceneRenderer.ts's drawMeasurements) exactly as
// `19_IMPORT_EXPORT.md` §5's PNG row already specifies ("Import/Export Engine invokes the
// rendering layer, doesn't reinvent the composition"), extended with the DOM-only text overlays
// (name/value chip, vertex labels, edge lengths, the scale caption) that live outside the canvas
// today — Q1 settled that those must appear in the export whenever they're currently visible.

export type PictureFormat = 'png' | 'jpeg' | 'pdf';

const EXPORT_SCALE = 2; // Q7 — fixed 2x oversampling, no separate "DPI" concept
const PADDING_WORLD = 24; // Q8 — fixed margin around the content, in world units (~CSS px at 1x)
const JPEG_QUALITY = 0.92;

function visibleMeasurements(surface: Surface): readonly Measurement[] {
  return surface.layers.flatMap((layer) => layer.measurements).filter((m) => !m.identity.hidden);
}

/** Union of every *visible* Measurement's bounds plus the background image's current rect, if
 * any — same aggregation as CanvasStage.svelte's own zoom-to-fit `contentBounds`, but filtered to
 * what's actually on screen right now (Q1: hidden content shouldn't influence the crop either).
 * `null` only when there is nothing to export. */
export function computeExportBounds(surface: Surface, backgroundImage: ImageBitmap | null): Bounds | null {
  const measurementBoundsList = visibleMeasurements(surface)
    .map((m) => shapeBounds(m.shape))
    .filter((b): b is Bounds => b !== null);
  const imageRect = backgroundImage ? effectiveImageRect(surface, backgroundImage.width, backgroundImage.height) : null;
  const imageBounds: Bounds | null = imageRect
    ? {
        minX: imageRect.origin.x,
        minY: imageRect.origin.y,
        maxX: imageRect.origin.x + imageRect.width,
        maxY: imageRect.origin.y + imageRect.height,
      }
    : null;
  const all = imageBounds ? [...measurementBoundsList, imageBounds] : measurementBoundsList;
  return all.length > 0 ? all.reduce(unionBounds) : null;
}

/** Q10 — PNG/JPEG/PDF stay enabled whenever the Surface has *any* content at all (a shape or a
 * background image), the same unfiltered-by-visibility convention TopBar's existing CSV
 * `hasMeasurements` gate already uses; only a genuinely empty/blank Surface disables the group. */
export function canExportPicture(surface: Surface, backgroundImage: ImageBitmap | null): boolean {
  const hasMeasurements = surface.layers.some((layer) => layer.measurements.length > 0);
  return hasMeasurements || backgroundImage !== null;
}

export interface ExportTransform {
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/** Sizes the export canvas to fit `bounds` plus `PADDING_WORLD` on every side at `EXPORT_SCALE`
 * — the inverse of `fitBounds` (viewport.ts), which fits content into a *fixed* box; here the box
 * grows to match the content (Q3 fit-to-content, Q7 resolution, Q8 padding). */
export function computeExportTransform(bounds: Bounds): ExportTransform {
  const paddedWidth = bounds.maxX - bounds.minX + PADDING_WORLD * 2;
  const paddedHeight = bounds.maxY - bounds.minY + PADDING_WORLD * 2;
  return {
    canvasWidthPx: Math.max(1, Math.ceil(paddedWidth * EXPORT_SCALE)),
    canvasHeightPx: Math.max(1, Math.ceil(paddedHeight * EXPORT_SCALE)),
    scale: EXPORT_SCALE,
    offsetX: EXPORT_SCALE * (PADDING_WORLD - bounds.minX),
    offsetY: EXPORT_SCALE * (PADDING_WORLD - bounds.minY),
  };
}

function readCssColor(name: string, fallback: string): string {
  // Canvas2D can't read CSS custom properties itself — same technique as CanvasStage.svelte's own
  // `readAccentColor`, just read at export time instead of every redraw.
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function drawChipPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
  value: string,
  panelColor: string,
  borderColor: string,
  primaryInk: string,
  secondaryInk: string,
): void {
  ctx.save();
  ctx.font = '700 12.5px sans-serif';
  const nameWidth = ctx.measureText(name).width;
  ctx.font = '400 12.5px sans-serif';
  const valueWidth = ctx.measureText(value).width;
  const width = Math.max(nameWidth, valueWidth) + 16;
  const height = 34;
  const left = x - width / 2;
  const top = y - height / 2;
  const radius = 4;

  ctx.beginPath();
  ctx.moveTo(left + radius, top);
  ctx.arcTo(left + width, top, left + width, top + height, radius);
  ctx.arcTo(left + width, top + height, left, top + height, radius);
  ctx.arcTo(left, top + height, left, top, radius);
  ctx.arcTo(left, top, left + width, top, radius);
  ctx.closePath();
  ctx.fillStyle = panelColor;
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = primaryInk;
  ctx.font = '700 12.5px sans-serif';
  ctx.fillText(name, x, top + height / 2 - 8);
  ctx.fillStyle = secondaryInk;
  ctx.font = '400 12.5px sans-serif';
  ctx.fillText(value, x, top + height / 2 + 8);
  ctx.restore();
}

/** Same "halo" trick VertexLabelChip.svelte's own `text-shadow` achieves in CSS (legibility over
 * an arbitrary-colored fill/photo) — a wide stroke in the background color behind the fill. */
function drawHaloText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, haloColor: string, font: string): void {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = haloColor;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export interface RenderedExport {
  readonly canvas: HTMLCanvasElement;
  readonly widthPx: number;
  readonly heightPx: number;
}

/** Draws everything currently visible on `surface` — shapes, name/value labels, vertex labels,
 * (if `showEdgeLengths`) per-edge polygon lengths, and a scale caption — onto a freshly sized
 * offscreen canvas: fit to content (Q3), 2x oversampled (Q7), fixed padding (Q8), no selection
 * highlight (Q5), opaque background (Q6). Not unit-tested directly — same reasoning as
 * sceneRenderer.ts's own untested draw calls (no real `<canvas>` under vitest's default 'node'
 * environment, 19_IMPORT_EXPORT.md §7); `computeExportBounds`/`computeExportTransform` above hold
 * the actual decision logic and are tested in isolation. */
export function renderExportCanvas(surface: Surface, backgroundImage: ImageBitmap | null, unit: Unit, showEdgeLengths: boolean): RenderedExport | null {
  const geometryBounds = computeExportBounds(surface, backgroundImage);
  if (!geometryBounds) return null;

  // Chip pills and vertex labels are free-floating text anchored to (but offset from) their
  // shape's own geometry — they can extend past `geometryBounds` (found live: a vertex label on
  // the corner vertex nearest the bounding box edge clipped off the exported picture, since the
  // fixed padding alone doesn't account for arbitrary label text width). Collected once here
  // (positions + text, no drawing yet) and measured against a scratch, unsized context so the
  // padding-expanded bounds below account for them *before* the real canvas is sized — then
  // reused for the actual draw pass further down, so the position math itself is never duplicated.
  const scratchCtx = document.createElement('canvas').getContext('2d')!;

  interface ChipDecoration {
    readonly kind: 'chip';
    readonly x: number;
    readonly y: number;
    readonly name: string;
    readonly value: string;
  }
  interface VertexLabelDecoration {
    readonly kind: 'vertexLabel';
    readonly x: number;
    readonly y: number;
    readonly text: string;
    readonly color: string;
    readonly fontSizePx: number;
  }
  const decorations: (ChipDecoration | VertexLabelDecoration)[] = [];

  for (const measurement of visibleMeasurements(surface)) {
    const centroid = shapeCentroid(measurement.shape);
    const chipOffset = measurement.shape.type === 'polygon' ? measurement.labelOffset : undefined;
    const chipPoint = chipOffset ? { x: centroid.x + chipOffset.dx, y: centroid.y + chipOffset.dy } : centroid;
    const baseDisplay = computeMeasurementDisplay(measurement.shape, surface.calibration, unit);
    const display = applyManualArea(
      baseDisplay,
      measurement.manualArea,
      measurement.shape.type === 'polygon' ? measurement.shape.vertices : undefined,
      unit,
    );
    decorations.push({ kind: 'chip', x: chipPoint.x, y: chipPoint.y, name: measurement.identity.name, value: display.primaryLabel });

    if (measurement.vertexLabels) {
      const points = resizeHandlePoints(measurement.shape);
      if (points) {
        measurement.vertexLabels.forEach((label, index) => {
          const vertexPoint = points[index];
          if (!label || !vertexPoint) return;
          const labelOffset = label.offset ?? { dx: 0, dy: 0 };
          decorations.push({
            kind: 'vertexLabel',
            x: vertexPoint.x + labelOffset.dx + 8,
            y: vertexPoint.y + labelOffset.dy - 8,
            text: label.text,
            color: label.color,
            fontSizePx: vertexLabelFontSizePx(label.fontSize),
          });
        });
      }
    }
  }

  const decorationBounds: Bounds[] = decorations.map((d) => {
    if (d.kind === 'chip') {
      scratchCtx.font = '700 12.5px sans-serif';
      const nameWidth = scratchCtx.measureText(d.name).width;
      scratchCtx.font = '400 12.5px sans-serif';
      const valueWidth = scratchCtx.measureText(d.value).width;
      const width = Math.max(nameWidth, valueWidth) + 16;
      const height = 34;
      return { minX: d.x - width / 2, minY: d.y - height / 2, maxX: d.x + width / 2, maxY: d.y + height / 2 };
    }
    scratchCtx.font = `700 ${d.fontSizePx}px sans-serif`;
    const width = scratchCtx.measureText(d.text).width;
    return { minX: d.x, minY: d.y - d.fontSizePx, maxX: d.x + width, maxY: d.y + d.fontSizePx * 0.3 };
  });

  const bounds = decorationBounds.reduce((acc, b) => unionBounds(acc, b), geometryBounds);
  const { canvasWidthPx, canvasHeightPx, scale, offsetX, offsetY } = computeExportTransform(bounds);

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidthPx;
  canvas.height = canvasHeightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const appBg = readCssColor('--af-surface-app', '#1E2024');
  const panelBg = readCssColor('--af-surface-panel', '#262A2E');
  const borderStrong = readCssColor('--af-border-strong', '#3A3F44');
  const inkPrimary = readCssColor('--af-ink-primary', '#F5F6F7');
  const inkSecondary = readCssColor('--af-ink-secondary', '#AEB4BA');
  const inkTertiary = readCssColor('--af-ink-tertiary', '#7A8086');
  const accent = readCssColor('--af-accent', '#0B6E4F');

  // Opaque background first (Q6), filled directly in device-pixel space so it always covers the
  // whole canvas regardless of the world-space transform applied next.
  ctx.fillStyle = appBg;
  ctx.fillRect(0, 0, canvasWidthPx, canvasHeightPx);

  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);

  if (backgroundImage) {
    const rect = effectiveImageRect(surface, backgroundImage.width, backgroundImage.height);
    if (rect) ctx.drawImage(backgroundImage, rect.origin.x, rect.origin.y, rect.width, rect.height);
  }

  drawMeasurements(ctx, surface, new Set(), accent); // Q5 — no selectedIds, never highlighted

  for (const decoration of decorations) {
    if (decoration.kind === 'chip') {
      drawChipPill(ctx, decoration.x, decoration.y, decoration.name, decoration.value, panelBg, borderStrong, inkPrimary, inkSecondary);
    } else {
      drawHaloText(ctx, decoration.text, decoration.x, decoration.y, decoration.color, appBg, `700 ${decoration.fontSizePx}px sans-serif`);
    }
  }

  if (showEdgeLengths) {
    for (const measurement of visibleMeasurements(surface)) {
      if (measurement.shape.type !== 'polygon') continue;
      for (const edgeLabel of computePolygonEdgeLabels(measurement.shape.vertices, true, surface.calibration, unit)) {
        // Bug fix (user report, 2026-11-19) — nudged inward off the stroke, same fix and same
        // constant as CanvasStage.svelte's `edgeLabelAnchor`; here there's no viewport scale to
        // divide by, 1 world unit already renders at this module's own fixed oversampling, so the
        // constant applies directly (same convention `PADDING_WORLD` above already assumes).
        const anchorX = edgeLabel.midpoint.x + edgeLabel.inwardUnitNormal.x * EDGE_LABEL_INWARD_OFFSET_PX;
        const anchorY = edgeLabel.midpoint.y + edgeLabel.inwardUnitNormal.y * EDGE_LABEL_INWARD_OFFSET_PX;
        ctx.save();
        ctx.translate(anchorX, anchorY);
        ctx.rotate((edgeLabel.angleDeg * Math.PI) / 180);
        ctx.font = '400 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = appBg;
        ctx.strokeText(edgeLabel.text, 0, 0);
        ctx.fillStyle = inkTertiary;
        ctx.fillText(edgeLabel.text, 0, 0);
        ctx.restore();
      }
    }
  }

  // Scale caption (Q4) — bottom-left, in device-pixel space; same text formula as the live
  // ScaleChip (StatusBar.svelte), via scaleLabel.ts, so the export never disagrees with the screen.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const caption = scaleCaptionText(surface.calibration, unit);
  if (caption) {
    const marginPx = 10 * scale;
    ctx.font = `600 ${13 * scale}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const metrics = ctx.measureText(caption);
    const chipHeight = 24 * scale;
    ctx.fillStyle = panelBg;
    ctx.fillRect(marginPx - 6 * scale, canvasHeightPx - marginPx - chipHeight, metrics.width + 12 * scale, chipHeight);
    ctx.fillStyle = inkSecondary;
    ctx.fillText(caption, marginPx, canvasHeightPx - marginPx - 7 * scale);
  }

  return { canvas, widthPx: canvasWidthPx, heightPx: canvasHeightPx };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob produced no blob'))), type, quality);
  });
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** Same sanitization as csvExport.ts's `csvFilename` — kept local rather than imported since the
 * two modules have no other shared concern, and duplicating four lines avoids a cross-import
 * between otherwise-independent export formats. */
function sanitizeBaseName(projectName: string): string {
  const sanitized = projectName
    .replace(/[\\/:*?"<>|]/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
  return sanitized || 'areaflow-export';
}

export interface PictureExportResult {
  readonly blob: Blob;
  readonly filename: string;
}

/** Top-level entry point ExportMenu.svelte calls — renders, then encodes to the requested format.
 * `null` when there's nothing to export (mirrors `canExportPicture`; the caller is expected to
 * have already gated the menu item on that, this is the defensive fallback). */
export async function exportSurfaceAsPicture(
  surface: Surface,
  backgroundImage: ImageBitmap | null,
  format: PictureFormat,
  unit: Unit,
  showEdgeLengths: boolean,
  projectName: string,
): Promise<PictureExportResult | null> {
  const rendered = renderExportCanvas(surface, backgroundImage, unit, showEdgeLengths);
  if (!rendered) return null;
  const base = sanitizeBaseName(projectName);

  if (format === 'png') {
    const blob = await canvasToBlob(rendered.canvas, 'image/png');
    return { blob, filename: `${base}.png` };
  }
  if (format === 'jpeg') {
    const blob = await canvasToBlob(rendered.canvas, 'image/jpeg', JPEG_QUALITY);
    return { blob, filename: `${base}.jpg` };
  }
  const jpegBlob = await canvasToBlob(rendered.canvas, 'image/jpeg', JPEG_QUALITY);
  const jpegBytes = await blobToBytes(jpegBlob);
  const pdfBytes = wrapJpegInPdf(jpegBytes, rendered.widthPx, rendered.heightPx);
  // `.slice()` forces a fresh ArrayBuffer-backed copy — `wrapJpegInPdf`'s own `Uint8Array` is
  // typed over the wider `ArrayBufferLike`, which `Blob`'s constructor doesn't accept directly.
  return { blob: new Blob([pdfBytes.slice()], { type: 'application/pdf' }), filename: `${base}.pdf` };
}
