import { writable } from 'svelte/store';
import type { Surface } from '../../core/domain/entities.js';
import { imageAssetKey } from '../../application/imageAsset.js';
import { storageAdapter } from './persistence.js';
import { renderPersistedPdfPage } from '../pdf/pdfRender.js';

// Surface entities never carry a blob/bitmap reference themselves (imageAsset.ts's header
// comment: the source blob is an Adapters-layer concern, not Core domain data) — this store is
// the UI layer's decoded-raster cache for whichever Surface Studio currently has open, keyed by
// the same imageAssetKey convention the write side (appState.ts's import flow) uses.

export const backgroundImage = writable<ImageBitmap | null>(null);

let currentBitmap: ImageBitmap | null = null;

/** ImageBitmap holds native decode memory that isn't reclaimed by ordinary GC — close the
 * previous one before replacing it, same discipline as revoking an object URL. */
function setBitmap(bitmap: ImageBitmap | null): void {
  currentBitmap?.close();
  currentBitmap = bitmap;
  backgroundImage.set(bitmap);
}

/** Already-decoded bitmap path — used right after an import, where the File is already in hand
 * and re-reading it back from StorageAdapter before first paint would just be a redundant decode
 * racing the fire-and-forget persist() write (appState.ts). */
export function setBackgroundImage(bitmap: ImageBitmap | null): void {
  setBitmap(bitmap);
}

/** Storage-backed path — called whenever Studio opens a Surface that wasn't just imported in this
 * same session (Home "Recent" reload, appState.ts's loadProject). No-op (clears to null) for
 * every Surface kind except 'image'/'pdfPage' today; Map backgrounds are a later slice
 * (19_IMPORT_EXPORT.md §2.3 — born-calibrated, tiles never persisted, so there's no stored blob
 * to decode in the first place). */
export async function loadBackgroundImageFor(surface: Surface): Promise<void> {
  if (surface.kind !== 'image' && surface.kind !== 'pdfPage') {
    setBitmap(null);
    return;
  }
  const blob = await storageAdapter.read(imageAssetKey(surface.id));
  if (!(blob instanceof Blob)) {
    setBitmap(null);
    return;
  }
  // 'pdfPage' persists the original PDF blob, never a pre-rendered snapshot (appState.ts's
  // commitImportedSurface) — re-decoded fresh here, same "store the source, derive the display
  // bitmap on load" split 'image' already uses, just through pdfRender.ts's renderer instead of
  // createImageBitmap directly.
  const bitmap = surface.kind === 'pdfPage' ? await renderPersistedPdfPage(blob) : await createImageBitmap(blob);
  setBitmap(bitmap);
}
