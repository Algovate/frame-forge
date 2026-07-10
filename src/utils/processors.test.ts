import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtractedFrame } from '../types';
import { batchRemoveBackground, cropFrames, expandAlphaMask, removeBorderConnectedColor } from './processors';
import { cropToCanvas } from './canvasEditor';
import { loadImage } from './media';
import { removeBackground } from '@imgly/background-removal';

vi.mock('@imgly/background-removal', () => ({
  removeBackground: vi.fn(async () => new Blob(['matted'], { type: 'image/png' })),
}));

vi.mock('./media', () => ({
  loadImage: vi.fn(async (dataUrl: string) => ({ dataUrl })),
  canvasToBlobUrl: vi.fn(async (canvas: { src?: string }) => `cropped:${canvas.src}`),
}));

vi.mock('./canvasEditor', () => ({
  cropToCanvas: vi.fn((img: { dataUrl: string }) => ({
    width: 3,
    height: 4,
    src: img.dataUrl,
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
    expect(result[0]).toMatchObject({ width: 3, height: 4 });
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

describe('expandAlphaMask', () => {
  it('expands neighboring alpha without changing color channels', () => {
    const data = new Uint8ClampedArray(3 * 3 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 10;
      data[i + 1] = 20;
      data[i + 2] = 30;
    }
    data[(1 * 3 + 1) * 4 + 3] = 255;

    const result = expandAlphaMask(data, 3, 3, 1);

    expect(Array.from(result.filter((_, i) => i % 4 === 3))).toEqual([
      255, 255, 255,
      255, 255, 255,
      255, 255, 255,
    ]);
    expect(Array.from(result.slice(0, 3))).toEqual([10, 20, 30]);
  });

  it('leaves the mask unchanged when radius is zero', () => {
    const data = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]);

    expect(Array.from(expandAlphaMask(data, 2, 1, 0))).toEqual(Array.from(data));
  });
});

describe('removeBorderConnectedColor', () => {
  it('removes only border-connected background and preserves enclosed light pixels', () => {
    const width = 5;
    const height = 5;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 250;
      data[i + 1] = 244;
      data[i + 2] = 232;
      data[i + 3] = 255;
    }

    const setPixel = (x: number, y: number, r: number, g: number, b: number) => {
      const idx = (y * width + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
    };

    for (let x = 1; x <= 3; x++) {
      setPixel(x, 1, 20, 20, 20);
      setPixel(x, 3, 20, 20, 20);
    }
    setPixel(1, 2, 20, 20, 20);
    setPixel(3, 2, 20, 20, 20);
    setPixel(2, 2, 255, 255, 255);

    const result = removeBorderConnectedColor({ data, width, height } as ImageData, 48);

    expect(result.data[3]).toBe(0);
    expect(result.data[(2 * width + 2) * 4 + 3]).toBe(255);
    expect(result.data[(1 * width + 2) * 4 + 3]).toBe(255);
  });
});

describe('batchRemoveBackground', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      blob: async () => new Blob(['source'], { type: 'image/png' }),
    })));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:matted');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  it('stores the original frame URL and reuses it for later matting runs', async () => {
    const result = await batchRemoveBackground([
      { id: 'a', dataUrl: 'blob:previous-matte', sourceDataUrl: 'original-frame', time: 0, selected: true },
    ], 'balanced');

    expect(fetch).toHaveBeenCalledWith('original-frame');
    expect(removeBackground).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ model: 'isnet_fp16' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:previous-matte');
    expect(result[0]).toMatchObject({ dataUrl: 'blob:matted', sourceDataUrl: 'original-frame' });
  });

  it('captures the current frame as source on the first matting run', async () => {
    const result = await batchRemoveBackground([
      { id: 'a', dataUrl: 'first-frame', time: 0, selected: true },
    ], 'balanced');

    expect(fetch).toHaveBeenCalledWith('first-frame');
    expect(result[0]).toMatchObject({ dataUrl: 'blob:matted', sourceDataUrl: 'first-frame' });
  });

  it('edge-key mode clears border-connected background without invoking the AI model', async () => {
    // jsdom has no canvas implementation, so stub the 2D context + toBlob to let
    // removeEdgeBackground run end-to-end through batchRemoveBackground.
    const data = new Uint8ClampedArray(5 * 5 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 250; data[i + 1] = 244; data[i + 2] = 232; data[i + 3] = 255;
    }
    const center = (2 * 5 + 2) * 4;
    data[center] = 20; data[center + 1] = 20; data[center + 2] = 20;
    const imageData = { data, width: 5, height: 5 } as ImageData;

    const fakeCtx = {
      drawImage: () => {},
      getImageData: () => imageData,
      putImageData: () => {},
    };
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCtx) as unknown as HTMLCanvasElement['getContext'];
    HTMLCanvasElement.prototype.toBlob = vi.fn((cb: (b: Blob | null) => void) =>
      cb(new Blob(['cleaned'], { type: 'image/png' })),
    ) as unknown as HTMLCanvasElement['toBlob'];
    vi.mocked(loadImage).mockResolvedValueOnce({ naturalWidth: 5, width: 5 } as never);

    try {
      const result = await batchRemoveBackground([
        { id: 'a', dataUrl: 'frame-a', time: 0, selected: true },
      ], 'edge-key');

      expect(data[3]).toBe(0);                       // border-connected background cleared
      expect(data[center + 3]).toBe(255);            // enclosed foreground preserved
      expect(removeBackground).not.toHaveBeenCalled();
      expect(loadImage).toHaveBeenCalledWith('frame-a');
      expect(result[0]).toMatchObject({ dataUrl: 'blob:matted', sourceDataUrl: 'frame-a' });
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      HTMLCanvasElement.prototype.toBlob = originalToBlob;
    }
  });
});
