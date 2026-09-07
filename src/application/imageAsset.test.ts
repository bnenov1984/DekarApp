import { describe, expect, it } from 'vitest';
import { imageAssetKey } from './imageAsset.js';

describe('imageAssetKey', () => {
  it('derives a stable, distinct key per surface id', () => {
    expect(imageAssetKey('surface1')).toBe('surface-image:surface1');
    expect(imageAssetKey('surface2')).not.toBe(imageAssetKey('surface1'));
  });
});
