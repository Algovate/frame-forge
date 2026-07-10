import JSZip from 'jszip';
import type { ExtractedFrame } from '../types';
import { loadImage, resizeImage } from './media';
import { fitImageToCanvas, getObjectFitRect } from './canvasFit';
import { getFFmpeg, fileDataToBlob } from './ffmpegSplitter';

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
  const fps = 1000 / delay;

  const ffmpeg = await getFFmpeg();

  // Create an offscreen canvas to optionally resize/pad frames before passing to FFmpeg
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const frameName = (i: number) => `frame_${i.toString().padStart(4, '0')}.png`;
  let written = 0;
  let result: ExportResult | null = null;

  try {
    // Process and write all frames to FFmpeg WASM FS
    for (let i = 0; i < selectedFrames.length; i++) {
      const frame = selectedFrames[i];

      let buffer: Uint8Array;
      if (sized && ctx) {
        const img = await loadImage(frame.dataUrl);
        canvas.width = w!;
        canvas.height = h!;
        ctx.clearRect(0, 0, w!, h!);
        const rect = getObjectFitRect(img.width, img.height, w!, h!, 'contain');
        ctx.drawImage(img, rect.dx, rect.dy, rect.dw, rect.dh);

        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
        if (!blob) throw new Error('Failed to create frame blob');
        buffer = new Uint8Array(await blob.arrayBuffer());
      } else {
        const resp = await fetch(frame.dataUrl);
        buffer = new Uint8Array(await resp.arrayBuffer());
      }

      await ffmpeg.writeFile(frameName(i), buffer);
      written++;
    }

    // Run FFmpeg to generate GIF
    // We use a complex filtergraph to generate a high quality palette and use it
    await ffmpeg.exec([
      '-framerate', fps.toString(),
      '-i', 'frame_%04d.png',
      '-vf', 'split[s0][s1];[s0]palettegen=reserve_transparent=1[p];[s1][p]paletteuse=alpha_threshold=128',
      '-loop', '0',
      'output.gif'
    ]);

    // Read output
    const data = await ffmpeg.readFile('output.gif');
    const blob = fileDataToBlob(data, 'image/gif');

    const filename = 'wechat-sticker.gif';
    downloadBlob(blob, filename);
    result = { filename, sizeBytes: blob.size };
  } finally {
    // Always purge this run's files from the shared singleton MEMFS — a thrown
    // exec/read would otherwise leave stale frame_*.png that the next export or
    // extract silently picks up (image2 demuxer / listDir are greedy).
    for (let i = 0; i < written; i++) {
      await ffmpeg.deleteFile(frameName(i)).catch(() => {});
    }
    await ffmpeg.deleteFile('output.gif').catch(() => {});
  }

  return result;
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
