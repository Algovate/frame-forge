import { parseGIF, decompressFrames } from 'gifuct-js';
import type { ExtractedFrame } from '../types';
import { loadImage, randomId, canvasToBlobUrl, revokeFrameUrls } from './media';
import { getFFmpeg, fileDataToBlob } from './ffmpegSpliter';
import { fetchFile } from '@ffmpeg/util';

export const extractFromGIF = async (
  file: File,
  onProgress?: (frame: ExtractedFrame[]) => void
): Promise<ExtractedFrame[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const gif = parseGIF(arrayBuffer);
  const gifFrames = decompressFrames(gif, true);

  if (gifFrames.length === 0) return [];

  // The canvas must cover every frame's placement (the GIF logical screen),
  // not just the first frame's patch — otherwise later frames get clipped.
  let screenW = 0;
  let screenH = 0;
  for (const f of gifFrames) {
    screenW = Math.max(screenW, f.dims.left + f.dims.width);
    screenH = Math.max(screenH, f.dims.top + f.dims.height);
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  canvas.width = screenW;
  canvas.height = screenH;

  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return [];
  tempCanvas.width = screenW;
  tempCanvas.height = screenH;

  const extracted: ExtractedFrame[] = [];
  let currentTime = 0;

  for (let i = 0; i < gifFrames.length; i++) {
    const frame = gifFrames[i];
    // Snapshot before drawing only when this frame's disposal is
    // restore-to-previous (type 3), so we can revert the temp canvas after.
    const snapshot = frame.disposalType === 3 ? tempCtx.getImageData(0, 0, screenW, screenH) : null;

    const frameData = new ImageData(
      new Uint8ClampedArray(frame.patch),
      frame.dims.width,
      frame.dims.height
    );
    tempCtx.putImageData(frameData, frame.dims.left, frame.dims.top);

    ctx.clearRect(0, 0, screenW, screenH);
    ctx.drawImage(tempCanvas, 0, 0);

    const blobUrl = await canvasToBlobUrl(canvas);

    extracted.push({
      id: randomId('gif', i),
      dataUrl: blobUrl,
      width: canvas.width,
      height: canvas.height,
      time: currentTime,
      selected: true,
    });

    // Apply THIS frame's disposal before the next frame composites.
    if (frame.disposalType === 2) {
      tempCtx.clearRect(0, 0, screenW, screenH);
    } else if (frame.disposalType === 3 && snapshot) {
      tempCtx.putImageData(snapshot, 0, 0);
    }

    currentTime += (frame.delay || 100) / 1000;
    if (onProgress) onProgress([...extracted]);
    await new Promise((r) => setTimeout(r, 0)); // yield to UI
  }
  return extracted;
};

export const extractFromVideo = async (
  file: File,
  fps: number,
  startTime: number = 0,
  endTime: number = -1,
  onProgress?: (frame: ExtractedFrame[]) => void
): Promise<{ frames: ExtractedFrame[]; videoWidth: number; videoHeight: number }> => {
  const ffmpeg = await getFFmpeg();
  const inputName = `input_${Date.now()}.mp4`;
  await ffmpeg.writeFile(inputName, await fetchFile(file));

  // Build FFmpeg command
  const args: string[] = [];
  if (startTime > 0) {
    args.push('-ss', startTime.toString());
  }

  args.push('-i', inputName);

  if (endTime >= 0 && endTime > startTime) {
    args.push('-t', (endTime - startTime).toString());
  }

  args.push('-vf', `fps=${fps}`);
  args.push('frame_%04d.png');

  const extracted: ExtractedFrame[] = [];
  let videoWidth = 0;
  let videoHeight = 0;
  let completed = false;

  try {
    await ffmpeg.exec(args);

    const dir = await ffmpeg.listDir('.');
    const pngFiles = dir
      .filter((f) => f.name.startsWith('frame_') && f.name.endsWith('.png'))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (let i = 0; i < pngFiles.length; i++) {
      const data = await ffmpeg.readFile(pngFiles[i].name);
      const blob = fileDataToBlob(data, 'image/png');
      const dataUrl = URL.createObjectURL(blob);

      if (i === 0) {
        const img = await loadImage(dataUrl);
        videoWidth = img.width;
        videoHeight = img.height;
      }

      extracted.push({
        id: randomId('vid', i),
        dataUrl,
        width: videoWidth,
        height: videoHeight,
        time: startTime + i * (1 / fps),
        selected: true
      });

      // Clean up WASM filesystem memory as we go
      await ffmpeg.deleteFile(pngFiles[i].name);

      if (onProgress) onProgress([...extracted]);
    }

    completed = true;
  } finally {
    if (!completed) {
      // Reclaim any blob URLs we created before the failure, then purge leftover
      // WASM frames FFmpeg produced — otherwise a crashed extract leaks URLs and
      // its stale frame_*.png poison the next extract/export via shared MEMFS.
      revokeFrameUrls(extracted);
      try {
        const remaining = await ffmpeg.listDir('.');
        for (const f of remaining) {
          if (f.name.startsWith('frame_') && f.name.endsWith('.png')) {
            await ffmpeg.deleteFile(f.name).catch(() => {});
          }
        }
      } catch {
        // listDir best-effort; the input delete below still runs
      }
    }
    await ffmpeg.deleteFile(inputName).catch(() => {});
  }

  return { frames: extracted, videoWidth, videoHeight };
};

/** Decode one or more static images in parallel, assigning each an index-based
 *  id and an evenly-spaced timeline position (so a batch reads back as a
 *  sequence at `fps`). A single image collapses to id `img_0` at time 0. */
export const extractFromImages = async (files: File[], fps: number): Promise<ExtractedFrame[]> =>
  Promise.all(
    files.map(async (file, i) => {
      const url = URL.createObjectURL(file);
      try {
        const img = await loadImage(url);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No 2D context available');
        ctx.drawImage(img, 0, 0);
        const blobUrl = await canvasToBlobUrl(canvas);
        return {
          id: randomId('img', i),
          dataUrl: blobUrl,
          width: canvas.width,
          height: canvas.height,
          time: i * (1 / fps),
          selected: true,
        };
      } finally {
        URL.revokeObjectURL(url);
      }
    }),
  );
