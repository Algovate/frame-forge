import JSZip from 'jszip';
import GIF from 'gif.js';
import type { ExtractedFrame } from '../types';
import { loadImage, resizeImage } from './media';
import { fitImageToCanvas } from './canvasFit';

export interface ExportResult {
  filename: string;
  sizeBytes: number;
}

const downloadBlob = (blob: Blob, filename: string) => {
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

  // Only set explicit dimensions when the user asked for a size; otherwise let
  // gif.js derive the canvas from the frames (passing width:0 is ambiguous).
  const opts: { workers: number; quality: number; workerScript: string; width?: number; height?: number } = {
    workers: 2,
    quality: 10,
    workerScript: '/gif.worker.js',
  };
  if (w && h) {
    opts.width = w;
    opts.height = h;
  }
  const gif = new GIF(opts);

  const maybeFit = (dataUrl: string) => (w && h ? fitImageToCanvas(dataUrl, w, h, 'contain') : dataUrl);

  for (const frame of selectedFrames) {
    const img = await loadImage(await maybeFit(frame.dataUrl));
    gif.addFrame(img, { delay });
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
