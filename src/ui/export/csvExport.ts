import type { Measurement, Surface } from '../../core/domain/entities.js';
import type { Unit } from '../../core/domain/types.js';
import { applyManualArea, computeMeasurementDisplay, formatLengthValue } from '../measurement/computeDisplay.js';

// PO follow-up (UX review, item A1 "no export/report", scoped to a v1) — before this, the app had
// no way to get measurements out at all: the workflow ended at a screenshot. A full Report
// pipeline (templates, frozen ReportSnapshot entries, PDF) is modeled in the domain
// (entities.ts's Report/ReportSnapshot) but genuinely unbuilt — this is the pragmatic minimum
// that actually closes the loop for a professional user: every Measurement, in the unit they're
// currently viewing, as a CSV any spreadsheet/CAD tool opens directly. Lives in ui/export (not
// application/) because it's a pure display-formatting concern layered on computeDisplay.ts,
// exactly like every other *display* module here — never touches a Command/the CommandStack.

function csvEscape(value: string): string {
  // RFC 4180: a field containing the delimiter, a quote, or a newline must be quoted, with
  // embedded quotes doubled. Every other field is written bare (matches what Excel/Sheets/Numbers
  // themselves emit, and keeps a typical row's numbers/names readable in a raw text view).
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function shapeTypeLabel(measurement: Measurement): string {
  switch (measurement.shape.type) {
    case 'polygon':
      return 'Polygon';
    case 'rectangle':
      return 'Rectangle';
    case 'circle':
      return 'Circle';
    case 'line':
      return 'Distance';
    case 'curve':
      return 'Curve';
    case 'freehand':
      return 'Freehand';
  }
}

const CSV_HEADER = ['Name', 'Type', 'Area', 'Perimeter', 'Length', 'Note'] as const;

/** One row per Measurement across every Layer, in the Surface's raw (creation) order — a plain,
 * predictable order for a data export, not the Layers panel's reversed "front row first"
 * presentation order (MeasurementList.svelte's own comment explains why that one's reversed;
 * nothing about an export needs that). Area/Perimeter are populated for closed shapes,
 * Length for open ones (Line, open Freehand/Curve) — never both, mirroring PropertyPanel's own
 * Values section (computeDisplay.ts's `MeasurementDisplay.values` is the single source for both). */
export function buildMeasurementsCsv(surface: Surface, unit: Unit): string {
  const rows = surface.layers
    .flatMap((layer) => layer.measurements)
    .map((measurement): readonly string[] => {
      // QA fix (manual area) — same override PropertyPanel/MeasurementList already apply; without
      // it a manual-area Measurement exported its raw geometric area instead of the recorded
      // real-world value. `baseDisplay` (untouched) is still what Perimeter reads its unit from —
      // same reasoning as PropertyPanel.svelte's own `baseDisplay`/`display` split: manual area is
      // always m²-referenced, independent of calibration, and must not relabel Perimeter's unit.
      const baseDisplay = computeMeasurementDisplay(measurement.shape, surface.calibration, unit);
      const display = applyManualArea(
        baseDisplay,
        measurement.manualArea,
        measurement.shape.type === 'polygon' ? measurement.shape.vertices : undefined,
        unit,
      );
      const area = display.values.area !== undefined ? display.primaryLabel : '';
      const perimeter =
        display.values.perimeter !== undefined ? formatLengthValue(display.values.perimeter, baseDisplay.values.unit) : '';
      const length = display.values.length !== undefined ? display.primaryLabel : '';
      return [measurement.identity.name, shapeTypeLabel(measurement), area, perimeter, length, measurement.identity.note ?? ''];
    });

  return [CSV_HEADER, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');
}

/** Same sanitization category as `filenamify`-style libraries this project doesn't depend on —
 * strips characters invalid in a Windows/macOS filename, collapses whitespace, and falls back to
 * a fixed name for a project that's been renamed down to nothing usable. */
export function csvFilename(projectName: string): string {
  const sanitized = projectName
    .replace(/[\\/:*?"<>|]/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
  return `${sanitized || 'areaflow-export'}.csv`;
}
