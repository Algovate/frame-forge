import { describe, expect, it } from 'vitest';
import { classifyStickerSource } from './media';

const file = (name: string, type: string) => new File(['x'], name, { type });

describe('classifyStickerSource', () => {
  it('classifies GIF sources separately from static images', () => {
    expect(classifyStickerSource(file('reaction.gif', 'image/gif'))).toBe('gif');
    expect(classifyStickerSource(file('reaction.GIF', ''))).toBe('gif');
  });

  it('classifies supported videos by MIME type or extension fallback', () => {
    expect(classifyStickerSource(file('clip.mp4', 'video/mp4'))).toBe('video');
    expect(classifyStickerSource(file('clip.mov', ''))).toBe('video');
  });

  it('rejects static images for the P0 dynamic sticker flow', () => {
    expect(classifyStickerSource(file('still.png', 'image/png'))).toBe('static-image');
    expect(classifyStickerSource(file('still.webp', 'image/webp'))).toBe('static-image');
  });

  it('returns null for unsupported files', () => {
    expect(classifyStickerSource(file('notes.txt', 'text/plain'))).toBeNull();
  });
});
