import { parseGIF, decompressFrames } from 'gifuct-js';
import type { ExtractedFrame } from '../types';

/** Sanity cap: beyond this, full-resolution PNG data URLs in React state
 *  would OOM the tab. Surfaced as a clear error rather than a silent crash. */
const MAX_VIDEO_FRAMES = 1000;

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

    extracted.push({
      id: `gif_${i}`,
      dataUrl: canvas.toDataURL('image/png'),
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
  const video = document.createElement('video');
  const src = URL.createObjectURL(file);
  video.src = src;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  try {
    // loadeddata (not just metadata) so frame data is available for seeking.
    await new Promise<void>((resolve, reject) => {
      const onReady = () => finish(resolve);
      const onError = () => finish(() => reject(new Error('Could not read this video')));
      const finish = (done: () => void) => {
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('error', onError);
        done();
      };
      video.addEventListener('loadeddata', onReady);
      video.addEventListener('error', onError);
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    if (!video.videoWidth || !video.videoHeight) throw new Error('Video has no dimensions');

    const duration = video.duration;
    if (!isFinite(duration) || duration <= 0) throw new Error('Video duration is unknown');

    const actualEndTime = endTime >= 0 ? Math.min(endTime, duration) : duration;
    const clampedStart = Math.max(0, Math.min(startTime, actualEndTime));

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const timeStep = 1 / fps;
    // Integer frame count via index, not float accumulation, so the boundary
    // is stable and frame ids don't collide.
    const frameCount = Math.max(0, Math.floor((actualEndTime - clampedStart) / timeStep) + 1);
    if (frameCount > MAX_VIDEO_FRAMES) {
      throw new Error(
        `That would produce ${frameCount} frames — lower the FPS or trim the timeline to stay under ${MAX_VIDEO_FRAMES}.`
      );
    }

    const captureFrame = (time: number): Promise<string> =>
      new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
          window.clearTimeout(timeout);
          video.removeEventListener('seeked', onSeeked);
          video.removeEventListener('error', onError);
        };
        const timeout = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error(`Timed out seeking to ${time.toFixed(2)}s`));
        }, 5000);
        const onSeeked = () => {
          if (settled) return;
          settled = true;
          cleanup();
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        };
        const onError = () => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error('Video error while seeking'));
        };
        video.addEventListener('seeked', onSeeked);
        video.addEventListener('error', onError);
        video.currentTime = time;
      });

    const extracted: ExtractedFrame[] = [];
    for (let i = 0; i < frameCount; i++) {
      const t = clampedStart + i * timeStep;
      const dataUrl = await captureFrame(t);
      extracted.push({ id: `vid_${i}`, dataUrl, width: canvas.width, height: canvas.height, time: t, selected: true });
      if (onProgress) onProgress([...extracted]);
      await new Promise((r) => setTimeout(r, 0)); // yield to UI
    }

    return { frames: extracted, videoWidth: canvas.width, videoHeight: canvas.height };
  } finally {
    URL.revokeObjectURL(src);
  }
};
