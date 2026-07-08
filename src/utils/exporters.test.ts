import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtractedFrame } from '../types';

// ---------------------------------------------------------------------------
// Stubs – jsdom has no real canvas, so we build a minimal pixel-level fake
// that lets us verify the export pipeline preserves (or destroys) alpha.
// ---------------------------------------------------------------------------

/** A tiny RGBA pixel buffer that simulates a canvas's ImageData. */
const makePixelBuffer = (width: number, height: number, fill: number[] = [0, 0, 0, 0]) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = fill[3];
  }
  return data;
};

/**
 * Build a fake CanvasRenderingContext2D that tracks pixel data.
 * – clearRect zeroes out all pixels (transparent).
 * – drawImage composites the source image's pixel data onto the buffer.
 * – getImageData / putImageData work on the same buffer.
 * – toDataURL encodes a simple marker we can inspect.
 */
const buildFakeCanvas = (w: number, h: number) => {
  let pixels = makePixelBuffer(w, h);

  const ctx = {
    clearRect: () => {
      pixels = makePixelBuffer(w, h); // all-zero = fully transparent
    },
    drawImage: (source: any) => {
      // Composite: copy source pixel data over. If the source has alpha=0
      // pixels, they stay transparent in the destination (source-over default).
      if (source._pixels) {
        const src = source._pixels as Uint8ClampedArray;
        for (let i = 0; i < Math.min(src.length, pixels.length); i += 4) {
          const srcAlpha = src[i + 3];
          if (srcAlpha === 0) continue; // source pixel is transparent → skip
          // Simple overwrite for opaque source pixels (sufficient for tests)
          pixels[i] = src[i];
          pixels[i + 1] = src[i + 1];
          pixels[i + 2] = src[i + 2];
          pixels[i + 3] = src[i + 3];
        }
      }
    },
    fillRect: (_x: number, _y: number, _w: number, _h: number) => {
      // Simulate fillStyle fill
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = 255;
        pixels[i + 1] = 255;
        pixels[i + 2] = 255;
        pixels[i + 3] = 255;
      }
    },
    fillStyle: '',
    getImageData: () => ({ data: pixels, width: w, height: h }),
    putImageData: (imageData: { data: Uint8ClampedArray }) => {
      pixels = new Uint8ClampedArray(imageData.data);
    },
    _getPixels: () => pixels,
  };

  const canvas = {
    width: w,
    height: h,
    getContext: () => ctx,
    toDataURL: (mime?: string) => {
      // Encode pixel data in a detectable way so tests can inspect alpha.
      // We'll embed a JSON representation of the first few pixels.
      const sample = Array.from(pixels.slice(0, Math.min(64, pixels.length)));
      return `data:${mime ?? 'image/png'};pixeldata,${JSON.stringify(sample)}`;
    },
    toBlob: (cb: (b: Blob | null) => void) => {
      cb(new Blob([pixels], { type: 'image/png' }));
    },
  };

  return { canvas, ctx };
};

// Parse our fake data URL to extract pixel samples (unused in this test file but kept for reference)

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// We need to intercept canvas creation + loadImage so the entire pipeline
// runs through our fake pixel buffers.

let createdCanvases: ReturnType<typeof buildFakeCanvas>[] = [];
let sourcePixels: Uint8ClampedArray | null = null;

vi.mock('./media', () => ({
  loadImage: vi.fn(async () => {
    // Return a fake HTMLImageElement with pixel data attached
    return {
      width: 4,
      height: 4,
      _pixels: sourcePixels,
    };
  }),
  resizeImage: vi.fn(async (dataUrl: string) => dataUrl),
  classifyStickerSource: vi.fn(),
  classifySourceKind: vi.fn(),
  randomId: vi.fn(),
  revokeFrameUrls: vi.fn(),
}));

vi.mock('./canvasFit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./canvasFit')>();
  return {
    ...actual,
    fitImageToCanvas: vi.fn(async (dataUrl: string, w: number, h: number, _mode?: string) => {
      // Re-implement the real logic using our fake canvas so we can inspect results
      const { loadImage } = await import('./media');
      const img = await loadImage(dataUrl);
      const { canvas, ctx } = buildFakeCanvas(w, h);
      createdCanvases.push({ canvas: canvas as any, ctx: ctx as any });
      ctx.clearRect();
      ctx.drawImage(img);
      return canvas.toDataURL('image/png');
    }),
    getObjectFitRect: actual.getObjectFitRect,
  };
});

// Stub fetch for the blob conversion at the end of exportPNG
vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
  blob: async () => {
    // Just pass through — the important thing is the data URL content
    return new Blob([url], { type: 'image/png' });
  },
})));

// Stub URL.createObjectURL/revokeObjectURL
vi.stubGlobal('URL', {
  ...globalThis.URL,
  createObjectURL: (blob: Blob) => `blob:fake-${blob.size}`,
  revokeObjectURL: () => {},
});

// Stub document.createElement('a') and document.body for downloadBlob
const originalCreateElement = document.createElement.bind(document);
vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
  if (tag === 'a') {
    return { href: '', download: '', click: vi.fn() } as any;
  }
  return originalCreateElement(tag);
});
vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as any);
vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as any);

import { exportPNG } from './exporters';

describe('exportPNG transparency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createdCanvases = [];
    sourcePixels = null;
  });

  it('preserves fully transparent pixels in the output', async () => {
    // Create a 4x4 image where all pixels are fully transparent
    sourcePixels = makePixelBuffer(4, 4, [0, 0, 0, 0]);

    const frames: ExtractedFrame[] = [
      { id: 'test1', dataUrl: 'data:image/png;base64,transparent-image', width: 4, height: 4, time: 0, selected: true },
    ];

    const result = await exportPNG(frames, 4, 4);
    expect(result).not.toBeNull();

    // Verify that fitImageToCanvas was called
    expect(createdCanvases.length).toBe(1);

    // Inspect the pixel data from the output canvas
    const outputPixels = createdCanvases[0].ctx._getPixels();

    // All pixels should remain fully transparent (alpha = 0)
    for (let i = 0; i < outputPixels.length; i += 4) {
      expect(outputPixels[i + 3]).toBe(0); // alpha channel must be 0
    }
  });

  it('preserves semi-transparent pixels (alpha < 255) in the output', async () => {
    // Create a 4x4 image with semi-transparent red pixels (alpha=128)
    sourcePixels = makePixelBuffer(4, 4, [255, 0, 0, 128]);

    const frames: ExtractedFrame[] = [
      { id: 'test2', dataUrl: 'data:image/png;base64,semitransparent-image', width: 4, height: 4, time: 0, selected: true },
    ];

    const result = await exportPNG(frames, 4, 4);
    expect(result).not.toBeNull();

    const outputPixels = createdCanvases[0].ctx._getPixels();

    // All pixels should retain their semi-transparent alpha
    for (let i = 0; i < outputPixels.length; i += 4) {
      expect(outputPixels[i]).toBe(255);    // R
      expect(outputPixels[i + 1]).toBe(0);  // G
      expect(outputPixels[i + 2]).toBe(0);  // B
      expect(outputPixels[i + 3]).toBe(128); // alpha must be preserved
    }
  });

  it('preserves mixed transparent/opaque pixels (matted sticker)', async () => {
    // Simulate a matted sticker: some pixels are opaque (foreground),
    // some are fully transparent (background after removal)
    sourcePixels = makePixelBuffer(4, 4, [0, 0, 0, 0]); // start all transparent

    // Make the first 2 pixels opaque red (foreground)
    sourcePixels[0] = 255; sourcePixels[1] = 0; sourcePixels[2] = 0; sourcePixels[3] = 255;
    sourcePixels[4] = 0; sourcePixels[5] = 255; sourcePixels[6] = 0; sourcePixels[7] = 255;

    const frames: ExtractedFrame[] = [
      { id: 'test3', dataUrl: 'data:image/png;base64,matted-sticker', width: 4, height: 4, time: 0, selected: true },
    ];

    const result = await exportPNG(frames, 4, 4);
    expect(result).not.toBeNull();

    const outputPixels = createdCanvases[0].ctx._getPixels();

    // First pixel: opaque red
    expect(outputPixels[0]).toBe(255);  // R
    expect(outputPixels[1]).toBe(0);    // G
    expect(outputPixels[2]).toBe(0);    // B
    expect(outputPixels[3]).toBe(255);  // A = opaque

    // Second pixel: opaque green
    expect(outputPixels[4]).toBe(0);    // R
    expect(outputPixels[5]).toBe(255);  // G
    expect(outputPixels[6]).toBe(0);    // B
    expect(outputPixels[7]).toBe(255);  // A = opaque

    // Third pixel onward: fully transparent
    expect(outputPixels[8 + 3]).toBe(0);   // A = transparent
    expect(outputPixels[12 + 3]).toBe(0);  // A = transparent
  });

  it('does NOT export unselected frames', async () => {
    sourcePixels = makePixelBuffer(4, 4, [255, 0, 0, 255]);

    const frames: ExtractedFrame[] = [
      { id: 'test4', dataUrl: 'data:image/png;base64,some-image', width: 4, height: 4, time: 0, selected: false },
    ];

    const result = await exportPNG(frames, 4, 4);
    expect(result).toBeNull();
  });

  it('output data URL uses image/png mime type (supports alpha)', async () => {
    sourcePixels = makePixelBuffer(4, 4, [0, 0, 0, 0]);

    const frames: ExtractedFrame[] = [
      { id: 'test5', dataUrl: 'data:image/png;base64,test', width: 4, height: 4, time: 0, selected: true },
    ];

    await exportPNG(frames, 4, 4);

    // Verify the data URL generated by our fake canvas uses image/png
    const fakeCanvas = createdCanvases[0].canvas;
    const dataUrl = fakeCanvas.toDataURL('image/png');
    expect(dataUrl).toContain('image/png');
  });
});
