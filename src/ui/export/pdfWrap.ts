// Minimal single-page PDF wrapping one JPEG image as a full-page XObject — no layout, no fonts,
// no template. Grilling 2026-11-19, Q2: this "PDF export" is scoped to a plain picture wrapped in
// a PDF container, deliberately distinct from `19_IMPORT_EXPORT.md` §5's "PDF (Report)" row
// (PD-015's structured, template-driven document) — hand-rolling the handful of required PDF
// objects is simpler and lighter than pulling in a PDF-authoring library for something this
// narrow, and keeps this feature's own "shouldn't be very complex" scope honest.

const encoder = new TextEncoder();

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Wraps `jpegBytes` (a complete JFIF stream, e.g. from `canvas.toBlob('image/jpeg')`) as the
 * sole content of a single PDF page sized exactly `widthPx` x `heightPx` — 1 PDF unit = 1 px,
 * since there's no print/paper-size requirement here, just a portable picture (Q2/Q3). */
export function wrapJpegInPdf(jpegBytes: Uint8Array, widthPx: number, heightPx: number): Uint8Array {
  const w = Math.max(1, Math.round(widthPx));
  const h = Math.max(1, Math.round(heightPx));
  const contentStream = encoder.encode(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`);

  const parts: Uint8Array[] = [];
  const objectOffsets: number[] = [0, 0, 0, 0, 0, 0]; // 1-indexed; [0] unused
  let length = 0;

  function push(bytes: Uint8Array): void {
    parts.push(bytes);
    length += bytes.length;
  }

  push(encoder.encode('%PDF-1.4\n'));

  objectOffsets[1] = length;
  push(encoder.encode('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'));

  objectOffsets[2] = length;
  push(encoder.encode('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'));

  objectOffsets[3] = length;
  push(
    encoder.encode(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    ),
  );

  objectOffsets[4] = length;
  push(
    encoder.encode(
      `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
    ),
  );
  push(jpegBytes);
  push(encoder.encode('\nendstream\nendobj\n'));

  objectOffsets[5] = length;
  push(encoder.encode(`5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n`));
  push(contentStream);
  push(encoder.encode('\nendstream\nendobj\n'));

  const xrefOffset = length;
  const xrefLines = [
    'xref',
    '0 6',
    '0000000000 65535 f ',
    ...[1, 2, 3, 4, 5].map((i) => `${String(objectOffsets[i]).padStart(10, '0')} 00000 n `),
  ];
  push(encoder.encode(`${xrefLines.join('\n')}\n`));
  push(encoder.encode(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));

  return concatBytes(parts);
}
