import { afterEach, describe, expect, it, vi } from 'vitest';

// PO request (PDF import, grilling session 2026-11-18) — pdfjs-dist drives a real Worker and a
// real <canvas> 2D context, neither available under vitest's default 'node' environment (same
// constraint imageAssetSession.test.ts documents for createImageBitmap). Mocked at the module
// boundary so the *decision logic* here (single-page accept, multi-page/password/corrupt reject)
// is exercised directly, without needing a real PDF binary or a real browser canvas.
//
// A password-protected PDF is simulated by `err.name`, not a thrown subclass — pdfRender.ts's own
// comment explains why: `PasswordException` isn't an exported class in every pdfjs-dist version.
function fakePasswordException(): Error {
  const err = new Error('needs password');
  err.name = 'PasswordException';
  return err;
}

const mockGetDocument = vi.fn();

vi.mock('pdfjs-dist', () => ({
  getDocument: (...args: unknown[]) => mockGetDocument(...args),
  GlobalWorkerOptions: {},
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'fake-worker-url' }));

const { renderSinglePagePdf, renderPersistedPdfPage } = await import('./pdfRender.js');

function stubCanvasAndBitmap(): { close: ReturnType<typeof vi.fn> } {
  const bitmap = { close: vi.fn() };
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
  vi.stubGlobal('document', {
    createElement: vi.fn(() => ({
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({})),
    })),
  });
  return bitmap;
}

function fakePdfFile(): File {
  return new File([new Uint8Array([1, 2, 3])], 'plan.pdf', { type: 'application/pdf' });
}

function makeFakeDoc(numPages: number, getPage = vi.fn()) {
  return {
    numPages,
    getPage,
  };
}

function fakePage() {
  return {
    getViewport: () => ({ width: 100, height: 100 }),
    render: () => ({ promise: Promise.resolve() }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  mockGetDocument.mockReset();
});

describe('renderSinglePagePdf', () => {
  it('renders and returns a bitmap for a genuine single-page PDF', async () => {
    const bitmap = stubCanvasAndBitmap();
    const getPage = vi.fn().mockResolvedValue(fakePage());
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(makeFakeDoc(1, getPage)) });

    const result = await renderSinglePagePdf(fakePdfFile());
    expect(result).toEqual({ ok: true, bitmap });
  });

  it('rejects a multi-page PDF without ever rendering a page, naming the page count', async () => {
    stubCanvasAndBitmap();
    const getPage = vi.fn();
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(makeFakeDoc(12, getPage)) });

    const result = await renderSinglePagePdf(fakePdfFile());
    expect(result).toEqual({ ok: false, error: 'MULTI_PAGE_NOT_SUPPORTED', pageCount: 12 });
    expect(getPage).not.toHaveBeenCalled(); // never pays the render cost for a file it's refusing
  });

  it('reports PASSWORD_PROTECTED when the document requires a password', async () => {
    mockGetDocument.mockReturnValue({ promise: Promise.reject(fakePasswordException()) });

    const result = await renderSinglePagePdf(fakePdfFile());
    expect(result).toEqual({ ok: false, error: 'PASSWORD_PROTECTED' });
  });

  it('reports CORRUPT_FILE when the document fails to parse at all', async () => {
    mockGetDocument.mockReturnValue({ promise: Promise.reject(new Error('not a PDF')) });

    const result = await renderSinglePagePdf(fakePdfFile());
    expect(result).toEqual({ ok: false, error: 'CORRUPT_FILE' });
  });

  it('reports CORRUPT_FILE when page count is fine but rendering itself fails', async () => {
    stubCanvasAndBitmap();
    const getPage = vi.fn().mockRejectedValue(new Error('render blew up'));
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(makeFakeDoc(1, getPage)) });

    const result = await renderSinglePagePdf(fakePdfFile());
    expect(result).toEqual({ ok: false, error: 'CORRUPT_FILE' });
  });
});

describe('renderPersistedPdfPage', () => {
  it('returns a bitmap for a valid persisted single-page PDF blob', async () => {
    const bitmap = stubCanvasAndBitmap();
    const getPage = vi.fn().mockResolvedValue(fakePage());
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(makeFakeDoc(1, getPage)) });

    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' });
    expect(await renderPersistedPdfPage(blob)).toBe(bitmap);
  });

  it('returns null (never throws) on a decode failure', async () => {
    mockGetDocument.mockReturnValue({ promise: Promise.reject(new Error('corrupt')) });

    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' });
    expect(await renderPersistedPdfPage(blob)).toBeNull();
  });
});
