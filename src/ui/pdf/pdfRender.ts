import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// PO request (PDF import, grilling session 2026-11-18) — PD-011 already approved PDF as v1
// Surface scope (19_IMPORT_EXPORT.md §2.2); this first slice is **single-page PDFs only**. A
// multi-page file would need N Surfaces per Project, and nothing in the UI today lets a user
// navigate between more than one Surface in a Project (no Surface-tab-switcher exists) — building
// that wasn't asked for, so a multi-page PDF is rejected outright (MULTI_PAGE_NOT_SUPPORTED)
// rather than silently importing just the first page and dropping the rest.
//
// Module-level side effect (worker registration), same "configure once, use everywhere" shape as
// any other library setup — never re-run per import.
GlobalWorkerOptions.workerSrc = workerSrc;

/** 2x a 96-DPI baseline (~192 DPI effective) — sharp enough to trace a boundary precisely when
 * zoomed in, without the memory cost of a true print-resolution (300+ DPI) render. Grilling
 * 2026-11-18 Q7. Applies to every render path below, so a Surface's background always matches
 * whatever it was imported/re-decoded at. */
const RENDER_SCALE = 2;

export type PdfRenderError = 'CORRUPT_FILE' | 'PASSWORD_PROTECTED' | 'MULTI_PAGE_NOT_SUPPORTED';

export type PdfRenderResult =
  | { readonly ok: true; readonly bitmap: ImageBitmap }
  | { readonly ok: false; readonly error: PdfRenderError; readonly pageCount?: number };

async function renderFirstPage(data: ArrayBuffer): Promise<ImageBitmap> {
  const doc = await getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return createImageBitmap(canvas);
}

/**
 * Import-time entry point — validates page count (rejecting anything but a single page) before
 * rendering, since there's no point paying the render cost for a file we're going to refuse
 * anyway. `pageCount` is attached to a MULTI_PAGE_NOT_SUPPORTED rejection so the caller can name
 * it in the error message ("This PDF has 12 pages…") rather than a generic refusal.
 */
export async function renderSinglePagePdf(file: File): Promise<PdfRenderResult> {
  const data = await file.arrayBuffer();
  let doc;
  try {
    doc = await getDocument({ data: data.slice(0) }).promise;
  } catch (err) {
    // PasswordException isn't exported as a class in every pdfjs-dist version (checked: absent
    // from this one's top-level API) — `name` is the version-stable way to tell it apart from an
    // ordinary parse failure, since the thrown object is always a real Error either way.
    if (err instanceof Error && err.name === 'PasswordException') return { ok: false, error: 'PASSWORD_PROTECTED' };
    return { ok: false, error: 'CORRUPT_FILE' };
  }

  if (doc.numPages > 1) {
    return { ok: false, error: 'MULTI_PAGE_NOT_SUPPORTED', pageCount: doc.numPages };
  }

  try {
    const bitmap = await renderFirstPage(data.slice(0));
    return { ok: true, bitmap };
  } catch {
    return { ok: false, error: 'CORRUPT_FILE' };
  }
}

/**
 * Re-decode path for a Surface already known to be a valid single-page PDF — the same "store the
 * source file, derive the display bitmap fresh on every load" pattern `imageAssetSession.ts`
 * already uses for `image` Surfaces (`imageAssetKey`'s persisted blob is the PDF itself, never a
 * pre-rendered snapshot). No page-count re-validation: that already happened once, at import time
 * (renderSinglePagePdf above) — a Surface that made it into storage as `kind: 'pdfPage'` is single-
 * page by construction. Returns `null` on any decode failure rather than throwing, matching
 * `loadBackgroundImageFor`'s own "no-op on a bad/missing asset" convention.
 */
export async function renderPersistedPdfPage(blob: Blob): Promise<ImageBitmap | null> {
  try {
    return await renderFirstPage(await blob.arrayBuffer());
  } catch {
    return null;
  }
}
