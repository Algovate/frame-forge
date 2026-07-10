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

/** Max cropped outputs produced per single ffmpeg pass. Each pass decodes the
 * source once and re-encodes every cell in the chunk, so a larger chunk means
 * fewer decodes / WASM loads (faster) but higher peak memory. 8 keeps the WASM
 * heap well under its ceiling even on large sources while collapsing the
 * default 4×4 grid from 16 separate ffmpeg runs down to 2. */
const OUTPUTS_PER_PASS = 8;

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

  // Clamp the seek point to >= 0; a negative start would otherwise inflate the
  // -t duration. Applied as input options so the source is seeked once per pass.
  const seekStart = startTime !== undefined && startTime > 0 ? startTime : 0;
  const duration = endTime !== undefined && endTime > seekStart ? endTime - seekStart : undefined;

  // Slice the grid into fixed-size chunks. Each chunk is handled by ONE ffmpeg
  // pass: a single decode of the source → split into N streams → crop each →
  // N re-encodes. This replaces the old approach of one full decode + re-encode
  // (and one fresh WASM load + full file read) PER cell.
  const chunks: typeof geometry.parts[] = [];
  for (let i = 0; i < geometry.parts.length; i += OUTPUTS_PER_PASS) {
    chunks.push(geometry.parts.slice(i, i + OUTPUTS_PER_PASS));
  }

  const parts: SplitVideoPart[] = [];
  const total = geometry.parts.length;
  let current = 0;

  // Read the source from disk once; each pass copies these bytes into its own
  // WASM instance (see writeFile below). The old code re-ran fetchFile
  // (disk → JS) once per cell.
  const fileData = await fetchFile(file);

  let coreBlobURL = '';
  let wasmBlobURL = '';
  let workerBlobURL = '';

  try {
    coreBlobURL = await toBlobURL(coreURL, 'text/javascript');
    wasmBlobURL = await toBlobURL(wasmURL, 'application/wasm');
    workerBlobURL = await toBlobURL(workerURL, 'text/javascript');

    for (const chunk of chunks) {
      // A fresh instance per chunk avoids the Emscripten memory leak that
      // accumulates across sequential execs on high-res grids — the same reason
      // the old per-cell code terminated after every cell.
      const ffmpeg = new FFmpeg();
      try {
        await ffmpeg.load({
          coreURL: coreBlobURL,
          wasmURL: wasmBlobURL,
          workerURL: workerBlobURL,
        });

        // writeFile transfers (detaches) the buffer to the WASM worker, so each
        // pass gets its own copy. Reading from disk once and copying in memory
        // is far cheaper than re-running fetchFile per chunk — and reusing one
        // buffer would throw DataCloneError after the first transfer detaches it.
        await ffmpeg.writeFile(inputName, new Uint8Array(fileData));

        // filter_complex: split the single input into N streams and crop each to
        // its grid cell, all in one graph → one decode, N outputs.
        const n = chunk.length;
        const splitLabels = Array.from({ length: n }, (_, i) => `s${i}`);
        const cropLabels = Array.from({ length: n }, (_, i) => `v${i}`);
        const filterComplex = [
          `[0:v]split=${n}[${splitLabels.join('][')}]`,
          ...chunk.map(
            (part, i) =>
              `[${splitLabels[i]}]crop=${part.width}:${part.height}:${part.x}:${part.y}[${cropLabels[i]}]`,
          ),
        ].join(';');

        const args: string[] = [];
        if (seekStart > 0) {
          args.push('-ss', seekStart.toString());
        }
        if (duration !== undefined) {
          args.push('-t', duration.toString());
        }
        args.push('-i', inputName);
        args.push('-filter_complex', filterComplex);

        // Per-output maps + codec settings. Options preceding each filename
        // apply to that output only, so they are repeated for every cell.
        for (let i = 0; i < n; i++) {
          args.push('-map', `[${cropLabels[i]}]`);
          if (!removeAudio) {
            // Optional map: silently skips sources that have no audio track.
            args.push('-map', '0:a?');
          }
          args.push('-c:v', 'libx264', '-preset', 'ultrafast');
          if (removeAudio) {
            args.push('-an');
          } else {
            // Transcode to AAC: stream-copying non-MP4 audio (e.g. Opus from
            // webm) into the .mp4 container is invalid and makes ffmpeg fail.
            args.push('-c:a', 'aac');
          }
          args.push(getSplitPartFilename(baseName, chunk[i].row, chunk[i].col));
        }

        // One decode + N crops + N re-encodes in a single exec.
        await ffmpeg.exec(args);

        // Read each chunk output back. Progress is reported per completed part
        // so the UI advances smoothly within a pass.
        for (let i = 0; i < n; i++) {
          const part = chunk[i];
          const outputName = getSplitPartFilename(baseName, part.row, part.col);
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

          // Free MEMFS for this output before reading the next.
          await ffmpeg.deleteFile(outputName);

          current++;
          if (onProgress) onProgress(current, total);
        }
      } finally {
        // Fully terminate this instance to free WASM memory before the next
        // chunk, even if load/exec threw mid-pass.
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
