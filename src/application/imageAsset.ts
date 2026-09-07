import type { SurfaceId } from '../core/domain/entities.js';

// docs/14_DOMAIN_MODEL.md §3 / docs/19_IMPORT_EXPORT.md §2.1 — the source image blob is an
// attribute of an 'image' Surface but is deliberately NOT a field on the Surface entity itself
// (Core stays pure domain data; the blob is an Adapters-layer concern read/written through
// StorageAdapter, 11 §7). This key-derivation convention is the one thing that has to agree
// between every write site (appState.ts's import flow) and read site (imageAssetSession.ts) —
// centralized here so there's exactly one place that knows it.
export function imageAssetKey(surfaceId: SurfaceId): string {
  return `surface-image:${surfaceId}`;
}
