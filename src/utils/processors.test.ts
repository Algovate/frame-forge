import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtractedFrame } from '../types';
import { cropFrames } from './processors';
import { cropToCanvas } from './canvasEditor';
import { loadImage } from './media';

vi.mock('./media', () => ({
  loadImage: vi.fn(async (dataUrl: string) => ({ dataUrl })),
}));

vi.mock('./canvasEditor', () => ({
  cropToCanvas: vi.fn((img: { dataUrl: string }) => ({
    toDataURL: () => `cropped:${img.dataUrl}`,
  })),
}));

const frames: ExtractedFrame[] = [
  { id: 'a', dataUrl: 'frame-a', time: 0, selected: true },
  { id: 'b', dataUrl: 'frame-b', time: 1, selected: false },
  { id: 'c', dataUrl: 'frame-c', time: 2, selected: true },
];

describe('cropFrames', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('crops selected frames by default and leaves unselected frames unchanged', async () => {
    const result = await cropFrames(frames, { x: 1, y: 2, width: 3, height: 4 });

    expect(result.map((frame) => frame.dataUrl)).toEqual(['cropped:frame-a', 'frame-b', 'cropped:frame-c']);
    expect(loadImage).toHaveBeenCalledTimes(2);
    expect(cropToCanvas).toHaveBeenCalledTimes(2);
  });

  it('can crop every frame when selectedOnly is false', async () => {
    const result = await cropFrames(frames, { x: 1, y: 2, width: 3, height: 4 }, false);

    expect(result.map((frame) => frame.dataUrl)).toEqual(['cropped:frame-a', 'cropped:frame-b', 'cropped:frame-c']);
    expect(loadImage).toHaveBeenCalledTimes(3);
    expect(cropToCanvas).toHaveBeenCalledTimes(3);
  });
});
