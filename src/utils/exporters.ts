import JSZip from 'jszip';
import GIF from 'gif.js';
import type { ExtractedFrame } from '../types';
import { loadImage, resizeImage } from './media';
import { fitImageToCanvas, getObjectFitRect } from './canvasFit';

export interface ExportResult {
  filename: string;
  sizeBytes: number;
}

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const getSelected = (frames: ExtractedFrame[]) => frames.filter((f) => f.selected);

/** gif.js renders with a single transparent "key" color (pure green). It's used
 *  by both the gif.js options and the per-pixel alpha-threshold pass below, so
 *  the key color lives in one place — change it here and both stay in sync. */
const GIF_KEY = { r: 0, g: 255, b: 0 };
const GIF_KEY_INT = (GIF_KEY.r << 16) | (GIF_KEY.g << 8) | GIF_KEY.b;
const GIF_KEY_HEX = `#${GIF_KEY.r.toString(16).padStart(2, '0')}${GIF_KEY.g.toString(16).padStart(2, '0')}${GIF_KEY.b.toString(16).padStart(2, '0')}`;

export const exportZIP = async (frames: ExtractedFrame[], w: number, h: number) => {
  const selectedFrames = getSelected(frames);
  if (selectedFrames.length === 0) return;

  const zip = new JSZip();
  for (let i = 0; i < selectedFrames.length; i++) {
    const dataUrl = w && h ? await resizeImage(selectedFrames[i].dataUrl, w, h) : selectedFrames[i].dataUrl;
    // Hand bytes straight to JSZip — a base64 round-trip would waste ~33% memory.
    const blob = await (await fetch(dataUrl)).blob();
    zip.file(`frame_${i.toString().padStart(4, '0')}.png`, blob);
  }

  const content = await zip.generateAsync({ type: 'blob' });
  downloadBlob(content, 'frames.zip');
};

export const exportGIF = async (
  frames: ExtractedFrame[],
  delay: number,
  w: number,
  h: number,
): Promise<ExportResult | null> => {
  const selectedFrames = getSelected(frames);
  if (selectedFrames.length === 0) return null;

  const sized = !!(w && h);
  // Only set explicit dimensions when the user asked for a size; otherwise let
  // gif.js derive the canvas from the frames (passing width:0 is ambiguous).
  const opts: { workers: number; quality: number; workerScript: string; width?: number; height?: number; transparent?: any; background?: string } = {
    workers: 2,
    quality: 10,
    workerScript: import.meta.env.BASE_URL + 'gif.worker.js',
    transparent: GIF_KEY_INT,
    background: GIF_KEY_HEX,
  };
  if (sized) {
    opts.width = w;
    opts.height = h;
  }
  const gif = new GIF(opts);

  // One reusable threshold canvas: we re-rasterize + alpha-threshold every
  // frame onto it, so no fresh canvas/context per frame and no base64 round-trip
  // through fitImageToCanvas — fit straight from the decoded image.
  const canvas = document.createElement('canvas');
  // willReadFrequently: we getImageData on this canvas every frame to threshold alpha.
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  for (const frame of selectedFrames) {
    const img = await loadImage(frame.dataUrl);
    const cw = sized ? w! : img.width;
    const ch = sized ? h! : img.height;
    canvas.width = cw;
    canvas.height = ch;

    if (!ctx) {
      gif.addFrame(img, { delay });
      continue;
    }

    ctx.clearRect(0, 0, cw, ch);
    const rect = sized
      ? getObjectFitRect(img.width, img.height, w!, h!, 'contain')
      : { dx: 0, dy: 0, dw: img.width, dh: img.height };
    ctx.drawImage(img, rect.dx, rect.dy, rect.dw, rect.dh);

    // Alpha-threshold to gif.js's single transparent key color: pixels below the
    // cutoff become opaque green (the key); opaque pixels keep their true RGB.
    // This avoids color halos around semi-transparent matted edges.
    const imageData = ctx.getImageData(0, 0, cw, ch);
    const data = imageData.data;
    for (let j = 0; j < data.length; j += 4) {
      if (data[j + 3] < 128) {
        data[j] = GIF_KEY.r;
        data[j + 1] = GIF_KEY.g;
        data[j + 2] = GIF_KEY.b;
      }
      data[j + 3] = 255;
    }
    // Pass ImageData directly instead of putting it back on the canvas.
    // This avoids a bug where gif.js keeps a shallow reference to the reused canvas.
    gif.addFrame(imageData, { delay });
  }

  return new Promise<ExportResult>((resolve, reject) => {
    let timeoutId: number;
    gif.on('finished', (blob: Blob) => {
      window.clearTimeout(timeoutId);
      const filename = 'wechat-sticker.gif';
      downloadBlob(blob, filename);
      resolve({ filename, sizeBytes: blob.size });
    });
    gif.render();
    // gif.js has no error event surface we can rely on; guard with a timeout
    // so a stalled render rejects instead of hanging the caller.
    timeoutId = window.setTimeout(() => reject(new Error('GIF encoding timed out')), 120000);
  });
};

export const exportSpriteSheet = async (
  frames: ExtractedFrame[],
  colsConfig: number,
  pad: number,
  w: number,
  h: number
) => {
  const selectedFrames = getSelected(frames);
  if (selectedFrames.length === 0) return;

  const maybeResize = (dataUrl: string) => (w && h ? resizeImage(dataUrl, w, h) : dataUrl);

  // Decode every (optionally resized) frame up front so we can size cells from
  // the largest frame — prevents overlap when frames aren't a uniform size.
  const images = await Promise.all(
    selectedFrames.map(async (f) => loadImage(await maybeResize(f.dataUrl))),
  );
  const cellW = w && h ? w : images.reduce((m, img) => Math.max(m, img.width), 0);
  const cellH = w && h ? h : images.reduce((m, img) => Math.max(m, img.height), 0);

  const count = selectedFrames.length;
  const cols = colsConfig > 0 ? colsConfig : Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context');

  canvas.width = cols * cellW + (cols - 1) * pad;
  canvas.height = rows * cellH + (rows - 1) * pad;

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    ctx.drawImage(images[i], col * (cellW + pad), row * (cellH + pad));
  }

  return new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not generate sprite sheet'));
        return;
      }
      downloadBlob(blob, 'spritesheet.png');
      resolve();
    });
  });
};

export const exportPNG = async (
  frames: ExtractedFrame[],
  w: number,
  h: number
): Promise<ExportResult | null> => {
  const selectedFrames = getSelected(frames);
  if (selectedFrames.length === 0) return null;

  // We only export the first selected frame as PNG.
  const frame = selectedFrames[0];
  const resolvedDataUrl = await (w && h ? fitImageToCanvas(frame.dataUrl, w, h, 'contain') : frame.dataUrl);

  const blob = await (await fetch(resolvedDataUrl)).blob();
  const filename = 'wechat-sticker.png';
  downloadBlob(blob, filename);

  return { filename, sizeBytes: blob.size };
};
