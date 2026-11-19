import { describe, expect, it } from 'vitest';
import { wrapJpegInPdf } from './pdfWrap.js';

const decoder = new TextDecoder('latin1');

describe('wrapJpegInPdf', () => {
  it('produces a well-formed single-page PDF wrapping the given bytes', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]); // fake JFIF-ish payload
    const pdf = wrapJpegInPdf(jpeg, 300, 150);
    const text = decoder.decode(pdf);

    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text.endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/MediaBox [0 0 300 150]');
    expect(text).toContain('/Filter /DCTDecode');
    expect(text).toContain(`/Length ${jpeg.length}`);
    expect(text).toContain('q 300 0 0 150 0 0 cm /Im0 Do Q');

    // the embedded JPEG bytes are present verbatim, not corrupted by the surrounding text framing
    const jpegStart = pdf.indexOf(0xff, 10);
    expect(Array.from(pdf.slice(jpegStart, jpegStart + jpeg.length))).toEqual(Array.from(jpeg));
  });

  it('every xref offset actually points at its object\'s own "N 0 obj" line', () => {
    const jpeg = new Uint8Array([1, 2, 3]);
    const pdf = wrapJpegInPdf(jpeg, 10, 10);
    const text = decoder.decode(pdf);
    const xrefMatch = text.match(/xref\n0 6\n0000000000 65535 f \n([\s\S]*?)\ntrailer/);
    expect(xrefMatch).not.toBeNull();
    const entries = xrefMatch![1]!.split('\n');
    expect(entries).toHaveLength(5);
    entries.forEach((entry, i) => {
      const offset = Number(entry.slice(0, 10));
      const objectNumber = i + 1;
      expect(text.slice(offset, offset + `${objectNumber} 0 obj`.length)).toBe(`${objectNumber} 0 obj`);
    });
  });

  it('rounds non-integer pixel dimensions and never produces a zero-sized page', () => {
    const pdf = wrapJpegInPdf(new Uint8Array([0]), 0, 10.6);
    const text = decoder.decode(pdf);
    expect(text).toContain('/MediaBox [0 0 1 11]');
  });
});
