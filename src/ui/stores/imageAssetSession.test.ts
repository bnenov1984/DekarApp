import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { Surface } from '../../core/domain/entities.js';
import { imageAssetKey } from '../../application/imageAsset.js';
import { storageAdapter } from './persistence.js';

// PO request (PDF import, grilling session 2026-11-18) — pdfRender.ts's own renderer is tested
// directly in pdfRender.test.ts (mocking pdfjs-dist itself); here only the *dispatch* — a
// 'pdfPage' Surface routes through it instead of createImageBitmap — needs covering.
const mockRenderPersistedPdfPage = vi.fn();
vi.mock('../pdf/pdfRender.js', () => ({
  renderPersistedPdfPage: (...args: unknown[]) => mockRenderPersistedPdfPage(...args),
}));

const { backgroundImage, loadBackgroundImageFor, setBackgroundImage } = await import('./imageAssetSession.js');

// createImageBitmap/ImageBitmap are browser-only APIs, absent from the Node test environment
// (confirmed: `typeof createImageBitmap === 'undefined'` under vitest's default 'node'
// environment) — stubbed per test so loadBackgroundImageFor's decode step is exercisable at all.
function stubCreateImageBitmap(): { close: ReturnType<typeof vi.fn> } {
  const bitmap = { close: vi.fn() };
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
  return bitmap;
}

function makeImageSurface(id: string): Surface {
  return { id, kind: 'image', calibration: null, layers: [] };
}

function makePdfSurface(id: string): Surface {
  return { id, kind: 'pdfPage', calibration: null, layers: [] };
}

afterEach(() => {
  vi.unstubAllGlobals();
  mockRenderPersistedPdfPage.mockReset();
  setBackgroundImage(null);
});

describe('setBackgroundImage', () => {
  it('sets backgroundImage to the given bitmap', () => {
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    setBackgroundImage(bitmap);
    expect(get(backgroundImage)).toBe(bitmap);
  });

  it('closes the previous bitmap before replacing it', () => {
    const first = { close: vi.fn() } as unknown as ImageBitmap;
    const second = { close: vi.fn() } as unknown as ImageBitmap;
    setBackgroundImage(first);
    setBackgroundImage(second);
    expect((first as unknown as { close: ReturnType<typeof vi.fn> }).close).toHaveBeenCalledOnce();
    expect(get(backgroundImage)).toBe(second);
  });

  it('setting null closes the previous bitmap and clears the store', () => {
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    setBackgroundImage(bitmap);
    setBackgroundImage(null);
    expect((bitmap as unknown as { close: ReturnType<typeof vi.fn> }).close).toHaveBeenCalledOnce();
    expect(get(backgroundImage)).toBeNull();
  });
});

describe('loadBackgroundImageFor', () => {
  it('clears to null for a non-image Surface kind', async () => {
    setBackgroundImage({ close: vi.fn() } as unknown as ImageBitmap);
    await loadBackgroundImageFor({ id: 's1', kind: 'map', calibration: null, layers: [] });
    expect(get(backgroundImage)).toBeNull();
  });

  it('clears to null when no blob was ever written for this Surface', async () => {
    setBackgroundImage({ close: vi.fn() } as unknown as ImageBitmap);
    await loadBackgroundImageFor(makeImageSurface('no-blob-surface'));
    expect(get(backgroundImage)).toBeNull();
  });

  it('decodes and sets the stored blob for a real image Surface', async () => {
    const bitmap = stubCreateImageBitmap();
    const surface = makeImageSurface('with-blob-surface');
    await storageAdapter.write(imageAssetKey(surface.id), new Blob(['fake image bytes']));

    await loadBackgroundImageFor(surface);
    expect(get(backgroundImage)).toBe(bitmap);
  });

  it("routes a 'pdfPage' Surface through pdfRender.ts instead of createImageBitmap", async () => {
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    mockRenderPersistedPdfPage.mockResolvedValue(bitmap);
    const surface = makePdfSurface('with-pdf-surface');
    const stored = new Blob(['fake pdf bytes']);
    await storageAdapter.write(imageAssetKey(surface.id), stored);

    await loadBackgroundImageFor(surface);
    expect(get(backgroundImage)).toBe(bitmap);
    expect(mockRenderPersistedPdfPage).toHaveBeenCalledWith(expect.any(Blob));
  });

  it("clears to null when pdfRender.ts can't decode the stored blob", async () => {
    mockRenderPersistedPdfPage.mockResolvedValue(null);
    setBackgroundImage({ close: vi.fn() } as unknown as ImageBitmap);
    const surface = makePdfSurface('with-corrupt-pdf-surface');
    await storageAdapter.write(imageAssetKey(surface.id), new Blob(['corrupt']));

    await loadBackgroundImageFor(surface);
    expect(get(backgroundImage)).toBeNull();
  });
});
