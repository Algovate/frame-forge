import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptionSettings, ExtractedFrame } from '../types';
import { DEFAULT_CAPTION, applyCaptionToFrames } from './captions';
import { loadImage } from './media';

vi.mock('./media', () => ({
  loadImage: vi.fn(async () => ({ width: 240, height: 240 })),
}));

const frames: ExtractedFrame[] = [
  { id: 'a', dataUrl: 'frame-a', time: 0, selected: true },
  { id: 'b', dataUrl: 'frame-b', time: 1, selected: false },
];

const originalCreateElement = document.createElement.bind(document);

describe('DEFAULT_CAPTION', () => {
  it('uses high-contrast bottom sticker text by default', () => {
    expect(DEFAULT_CAPTION).toMatchObject({
      enabled: false,
      position: 'bottom',
      fillColor: '#ffffff',
      strokeColor: '#000000',
    });
  });
});

describe('applyCaptionToFrames', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(loadImage).mockResolvedValue({ width: 240, height: 240 } as HTMLImageElement);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName !== 'canvas') return originalCreateElement(tagName);
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: vi.fn(),
          measureText: (text: string) => ({ width: text.length * 10 }),
          strokeText: vi.fn(),
          fillText: vi.fn(),
          clearRect: vi.fn(),
          fillRect: vi.fn(),
          font: '',
          textAlign: 'center',
          textBaseline: 'alphabetic',
          lineJoin: 'round',
          strokeStyle: '',
          fillStyle: '',
          lineWidth: 0,
        }),
        toDataURL: () => 'data:image/png;base64,captioned',
      } as unknown as HTMLCanvasElement;
    });
  });

  it('does not render when caption is disabled or empty', async () => {
    const result = await applyCaptionToFrames(frames, DEFAULT_CAPTION);
    expect(result).toBe(frames);
    expect(loadImage).not.toHaveBeenCalled();
  });

  it('renders captions only onto selected frames', async () => {
    const caption: CaptionSettings = { ...DEFAULT_CAPTION, enabled: true, text: 'OK' };
    const result = await applyCaptionToFrames(frames, caption);

    expect(result[0].dataUrl).toContain('data:image/png');
    expect(result[1]).toBe(frames[1]);
    expect(loadImage).toHaveBeenCalledTimes(1);
  });
});
