import { describe, expect, it } from 'vitest';
import type { ProjectAsset } from '../types';
import { getAssetUseTarget, getBatchStickerEligibility, getSelectedAssets, getVisibleAssets, isStaticImageBatch } from './assets';

function asset(kind: ProjectAsset['kind'], type: string): ProjectAsset {
  const file = new File(['asset'], 'asset', { type });
  return { id: 'asset', kind, name: 'asset', blob: file, file, width: 0, height: 0, createdAt: 0 };
}

describe('getAssetUseTarget', () => {
  it('opens static images in the canvas editor', () => {
    expect(getAssetUseTarget(asset('image', 'image/png'), 'studio')).toBe('canvas-editor');
  });

  it('sends GIFs and videos to sticker studio by default', () => {
    expect(getAssetUseTarget(asset('image', 'image/gif'), 'studio')).toBe('studio');
    expect(getAssetUseTarget(asset('video', 'video/mp4'), 'studio')).toBe('studio');
  });

  it('keeps video assets in the splitter flow when tools is active', () => {
    expect(getAssetUseTarget(asset('split-video', 'video/mp4'), 'splitter')).toBe('splitter');
  });
});

describe('getVisibleAssets', () => {
  const recentImage = { ...asset('image', 'image/png'), id: 'recent', name: 'Final Sticker.png', createdAt: 20 };
  const olderVideo = { ...asset('video', 'video/mp4'), id: 'older', name: 'source-video.mp4', createdAt: 10 };
  const splitClip = { ...asset('split-video', 'video/mp4'), id: 'clip', name: 'clip-01.mp4', createdAt: 15 };
  const animatedGif = { ...asset('image', 'image/gif'), id: 'gif', name: 'animated.gif', createdAt: 25 };
  const assets = [olderVideo, recentImage, splitClip, animatedGif];

  it('sorts visible assets by newest first without mutating the library', () => {
    expect(getVisibleAssets(assets, 'all', '').map(({ id }) => id)).toEqual(['gif', 'recent', 'clip', 'older']);
    expect(assets.map(({ id }) => id)).toEqual(['older', 'recent', 'clip', 'gif']);
  });

  it('filters still images separately from motion assets', () => {
    expect(getVisibleAssets(assets, 'image', '').map(({ id }) => id)).toEqual(['recent']);
    expect(getVisibleAssets(assets, 'motion', '').map(({ id }) => id)).toEqual(['gif', 'clip', 'older']);
  });

  it('matches names case-insensitively within the selected filter', () => {
    expect(getVisibleAssets(assets, 'all', 'STICKER').map(({ id }) => id)).toEqual(['recent']);
  });
});

describe('asset batch helpers', () => {
  const staticImage = { ...asset('image', 'image/png'), id: 'image' };
  const animatedGif = { ...asset('image', 'image/gif'), id: 'gif' };
  const video = { ...asset('video', 'video/mp4'), id: 'video' };

  it('derives selected assets in the currently visible order', () => {
    expect(getSelectedAssets([staticImage, animatedGif, video], new Set(['video', 'image']))
      .map(({ id }) => id)).toEqual(['image', 'video']);
  });

  it('allows only non-GIF static images in a batch', () => {
    expect(isStaticImageBatch([staticImage])).toBe(true);
    expect(isStaticImageBatch([staticImage, animatedGif])).toBe(false);
    expect(isStaticImageBatch([video])).toBe(false);
    expect(isStaticImageBatch([])).toBe(false);
  });

  it('exposes a clear ineligible state for mixed and dynamic selections', () => {
    expect(getBatchStickerEligibility([staticImage])).toBe('ready');
    expect(getBatchStickerEligibility([staticImage, animatedGif])).toBe('requires-static-images');
    expect(getBatchStickerEligibility([video])).toBe('requires-static-images');
  });
});
