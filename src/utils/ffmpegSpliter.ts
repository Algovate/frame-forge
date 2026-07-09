import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import JSZip from 'jszip';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';
import workerURL from '@ffmpeg/ffmpeg/worker?url';

/** Max source size the splitter will accept (also enforced in the UI). */
export const MAX_VIDEO_SIZE = 500 * 1024 * 1024;

export interface SplitVideoPart {
  row: number;
  col: number;
  filename: string;
  blob: Blob;
  file: File;
  width: number;
  height: number;
}

export interface SplitGridGeometry {
  cellWidth: number;
  cellHeight: number;
  parts: Array<{
    row: number;
    col: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

export type SplitPadding = { top: number; right: number; bottom: number; left: number };

export function getSplitPartFilename(baseName: string, row: number, col: number): string {
  return `${baseName}_part_${row}_${col}.mp4`;
}

export function getSplitGridGeometry(
  dimensions: { width: number; height: number },
  rows: number,
  cols: number,
  padding: SplitPadding = { top: 0, right: 0, bottom: 0, left: 0 },
  gap: number = 0,
): SplitGridGeometry {
  if (!dimensions.width || !dimensions.height) {
    throw new Error('Invalid video dimensions');
  }

  const availWidth = dimensions.width - padding.left - padding.right - gap * (cols - 1);
  const availHeight = dimensions.height - padding.top - padding.bottom - gap * (rows - 1);

  const cellWidth = Math.floor(availWidth / cols);
  const cellHeight = Math.floor(availHeight / rows);
  if (cellWidth <= 0 || cellHeight <= 0) {
    throw new Error('Grid padding/gap leaves no room for cells');
  }

  const parts = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      parts.push({
        row,
        col,
        x: padding.left + col * (cellWidth + gap),
        y: padding.top + row * (cellHeight + gap),
        width: cellWidth,
        height: cellHeight,
      });
    }
  }

  return { cellWidth, cellHeight, parts };
}

export function fileDataToBlob(data: Awaited<ReturnType<FFmpeg['readFile']>>, type: string): Blob {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type });
}

export function getVideoDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    let settled = false;
    const done = (action: () => void) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      action();
    };
    // Metadata should arrive in well under a second; guard against files that
    // never fire loadedmetadata or error and would otherwise hang the promise.
    const timer = setTimeout(() => done(() => reject(new Error('Failed to load video metadata'))), 10000);
    video.onloadedmetadata = () =>
      done(() => {
        clearTimeout(timer);
        resolve({ width: video.videoWidth, height: video.videoHeight });
      });
    video.onerror = () =>
      done(() => {
        clearTimeout(timer);
        reject(new Error('Failed to load video metadata'));
      });
    video.src = url;
  });
}

let ffmpegInstance: FFmpeg | null = null;
let isLoading = false;

export async function preloadFFmpeg(): Promise<void> {
  if (ffmpegInstance || isLoading) return;
  isLoading = true;
  
  try {
    const ffmpeg = new FFmpeg();
    await ffmpeg.load({
      coreURL: await toBlobURL(coreURL, 'text/javascript'),
      wasmURL: await toBlobURL(wasmURL, 'application/wasm'),
      workerURL: await toBlobURL(workerURL, 'text/javascript'),
    });
    
    ffmpegInstance = ffmpeg;
  } catch (error) {
    console.error('Failed to preload FFmpeg:', error);
  } finally {
    isLoading = false;
  }
}

export async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegInstance) {
    await preloadFFmpeg();
    if (!ffmpegInstance) throw new Error('Failed to load FFmpeg');
  }
  return ffmpegInstance;
}

export async function splitVideoGridParts(
  file: File,
  rows: number,
  cols: number,
  padding: SplitPadding = { top: 0, right: 0, bottom: 0, left: 0 },
  gap: number = 0,
  removeAudio: boolean = false,
  dimensions?: { width: number; height: number },
  startTime?: number,
  endTime?: number,
  onProgress?: (part: number, total: number) => void
): Promise<SplitVideoPart[]> {
  if (file.size > MAX_VIDEO_SIZE) {
    throw new Error('FILE_TOO_LARGE');
  }

  const dims = dimensions ?? (await getVideoDimensions(file));
  const geometry = getSplitGridGeometry(dims, rows, cols, padding, gap);

  // Get extension from original file or default to mp4
  const ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')) : '.mp4';
  const inputName = `input${ext}`;
  const baseName = file.name.includes('.') ? file.name.substring(0, file.name.lastIndexOf('.')) : file.name;

  const parts: SplitVideoPart[] = [];
  const total = geometry.parts.length;
  let current = 0;

  let coreBlobURL = '';
  let wasmBlobURL = '';
  let workerBlobURL = '';

  try {
    coreBlobURL = await toBlobURL(coreURL, 'text/javascript');
    wasmBlobURL = await toBlobURL(wasmURL, 'application/wasm');
    workerBlobURL = await toBlobURL(workerURL, 'text/javascript');

    for (const part of geometry.parts) {
      current++;
      if (onProgress) onProgress(current, total);
      
      // Create a fresh FFmpeg instance for EACH part to prevent WASM memory leaks
      // (Emscripten OOM / Aborted() errors) when processing high-res grids.
      const ffmpeg = new FFmpeg();
      try {
        await ffmpeg.load({
          coreURL: coreBlobURL,
          wasmURL: wasmBlobURL,
          workerURL: workerBlobURL,
        });

        const fileData = await fetchFile(file);
        await ffmpeg.writeFile(inputName, fileData);

        const outputName = getSplitPartFilename(baseName, part.row, part.col);

        const args: string[] = [];

        // Clamp the seek point to >= 0; a negative start would otherwise inflate
        // the -t duration (the seek term feeds the duration math below).
        const seekStart = startTime !== undefined && startTime > 0 ? startTime : 0;
        if (seekStart > 0) {
          args.push('-ss', seekStart.toString());
        }
        if (endTime !== undefined && endTime > seekStart) {
          args.push('-t', (endTime - seekStart).toString());
        }

        args.push('-i', inputName);

        args.push(
          '-vf', `crop=${part.width}:${part.height}:${part.x}:${part.y}`,
          '-c:v', 'libx264',
          '-preset', 'ultrafast'
        );

        if (removeAudio) {
          args.push('-an');
        } else {
          // Transcode to AAC: stream-copying non-MP4 audio (e.g. Opus from webm)
          // into the .mp4 container is invalid and makes ffmpeg fail.
          args.push('-c:a', 'aac');
        }
        args.push(outputName);

        // Use FFmpeg crop filter, re-encode video with ultrafast preset
        await ffmpeg.exec(args);

        const data = await ffmpeg.readFile(outputName);
        const blob = fileDataToBlob(data, 'video/mp4');
        parts.push({
          row: part.row,
          col: part.col,
          filename: outputName,
          blob,
          file: new File([blob], outputName, { type: 'video/mp4' }),
          width: part.width,
          height: part.height,
        });

        // Free memory for this part
        await ffmpeg.deleteFile(outputName);
      } finally {
        // Fully terminate this instance to free WASM memory before the next
        // iteration, even if load/exec threw mid-cell.
        ffmpeg.terminate();
      }
    }
  } finally {
    if (coreBlobURL) URL.revokeObjectURL(coreBlobURL);
    if (wasmBlobURL) URL.revokeObjectURL(wasmBlobURL);
    if (workerBlobURL) URL.revokeObjectURL(workerBlobURL);
  }

  return parts;
}

export async function createSplitZip(parts: SplitVideoPart[]): Promise<Blob> {
  const zip = new JSZip();
  for (const part of parts) {
    zip.file(part.filename, part.blob);
  }
  return await zip.generateAsync({ type: 'blob' });
}
