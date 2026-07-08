import { removeBackground, type Config } from '@imgly/background-removal';
import type { ExtractedFrame, MattingMode } from '../types';
import { loadImage } from './media';
import { cropToCanvas, type PixelRect } from './canvasEditor';

const DEDUP_THUMB = 64;
const DEDUP_PIXEL_THRESHOLD = 30;

// Helper to get image data for a frame
const getFrameImageData = async (ctx: CanvasRenderingContext2D, dataUrl: string) => {
  const img = await loadImage(dataUrl);
  ctx.drawImage(img, 0, 0, DEDUP_THUMB, DEDUP_THUMB);
  return ctx.getImageData(0, 0, DEDUP_THUMB, DEDUP_THUMB).data;
};

// Returns similarity percentage (0-100) where 100 is identical
const calculateSimilarity = (imgData1: Uint8ClampedArray, imgData2: Uint8ClampedArray) => {
  let diffPixels = 0;
  for (let j = 0; j < imgData1.length; j += 4) {
    const rDiff = Math.abs(imgData1[j] - imgData2[j]);
    const gDiff = Math.abs(imgData1[j + 1] - imgData2[j + 1]);
    const bDiff = Math.abs(imgData1[j + 2] - imgData2[j + 2]);
    if (rDiff + gDiff + bDiff > DEDUP_PIXEL_THRESHOLD) diffPixels++;
  }
  const diffPercent = (diffPixels / (DEDUP_THUMB * DEDUP_THUMB)) * 100;
  return 100 - diffPercent; // Convert difference to similarity
};

// 1. Find Duplicate Frames
export const findDuplicateFrames = async (
  frames: ExtractedFrame[],
  similarityThreshold: number = 95
): Promise<ExtractedFrame[]> => {
  const canvas = document.createElement('canvas');
  canvas.width = DEDUP_THUMB;
  canvas.height = DEDUP_THUMB;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return frames;

  let prevImageData: Uint8ClampedArray | null = null;
  const newFrames = [...frames];

  for (let i = 0; i < newFrames.length; i++) {
    if (!newFrames[i].selected) continue;

    const imgData = await getFrameImageData(ctx, newFrames[i].dataUrl);

    if (prevImageData) {
      const similarity = calculateSimilarity(imgData, prevImageData);
      if (similarity >= similarityThreshold) {
        newFrames[i] = { ...newFrames[i], selected: false };
      } else {
        prevImageData = imgData;
      }
    } else {
      prevImageData = imgData;
    }
  }
  return newFrames;
};

// 2. Find Loop Frames
export const findLoopFrames = async (
  frames: ExtractedFrame[],
  similarityThreshold: number = 90
): Promise<ExtractedFrame[]> => {
  const canvas = document.createElement('canvas');
  canvas.width = DEDUP_THUMB;
  canvas.height = DEDUP_THUMB;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return frames;

  const newFrames = [...frames];
  
  // Find first selected frame
  const firstSelectedIndex = newFrames.findIndex(f => f.selected);
  if (firstSelectedIndex === -1) return frames;

  const firstImgData = await getFrameImageData(ctx, newFrames[firstSelectedIndex].dataUrl);
  let loopFoundIndex = -1;
  let hasLeftInitialState = false;

  for (let i = firstSelectedIndex + 1; i < newFrames.length; i++) {
    if (!newFrames[i].selected) continue;

    const imgData = await getFrameImageData(ctx, newFrames[i].dataUrl);
    const similarity = calculateSimilarity(firstImgData, imgData);

    if (!hasLeftInitialState) {
      // Wait for the animation to diverge significantly from the first frame
      // We use a lower threshold to ensure it has definitely moved away
      if (similarity < Math.min(similarityThreshold, 85)) {
        hasLeftInitialState = true;
      }
    } else {
      // Now we are looking for when it returns to the initial state
      if (similarity >= similarityThreshold) {
        loopFoundIndex = i;
        break;
      }
    }
  }

  if (loopFoundIndex !== -1) {
    // Deselect the loop frame and all subsequent frames
    for (let i = loopFoundIndex; i < newFrames.length; i++) {
      newFrames[i] = { ...newFrames[i], selected: false };
    }
  }

  return newFrames;
};

// 3. Find Jump Frames
export const findJumpFrames = async (
  frames: ExtractedFrame[],
  similarityThreshold: number = 50 // Lower default threshold for jumps
): Promise<ExtractedFrame[]> => {
  const canvas = document.createElement('canvas');
  canvas.width = DEDUP_THUMB;
  canvas.height = DEDUP_THUMB;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return frames;

  let prevImageData: Uint8ClampedArray | null = null;
  const newFrames = [...frames];

  for (let i = 0; i < newFrames.length; i++) {
    if (!newFrames[i].selected) continue;

    const imgData = await getFrameImageData(ctx, newFrames[i].dataUrl);

    if (prevImageData) {
      const similarity = calculateSimilarity(imgData, prevImageData);
      // If similarity is very low (below threshold), it's a jump
      if (similarity < similarityThreshold) {
        newFrames[i] = { ...newFrames[i], selected: false };
      }
    }
    // Update prevImageData to compare the next frame against the CURRENT frame (even if it was deselected)
    prevImageData = imgData;
  }
  return newFrames;
};

const EDGE_KEY_TOLERANCE = 48;
const EDGE_RECOVERY_RADIUS = 2;

export const batchRemoveBackground = async (
  frames: ExtractedFrame[],
  mode: MattingMode = 'edge-key',
  onProgress?: (msg: string, frames: ExtractedFrame[]) => void
): Promise<ExtractedFrame[]> => {
  const newFrames = [...frames];
  const verb = mode === 'edge-key' ? 'Cleaning' : 'Matting';
  for (let i = 0; i < newFrames.length; i++) {
    if (!newFrames[i].selected) continue;
    if (onProgress) onProgress(`${verb} frame ${i + 1}/${newFrames.length}...`, newFrames);

    const sourceDataUrl = newFrames[i].sourceDataUrl ?? newFrames[i].dataUrl;
    const transparentBlob = mode === 'edge-key'
      ? await removeEdgeBackground(sourceDataUrl)
      : await removeAiBackground(sourceDataUrl, mode);

    // Revoke the previous URL if it was one we created (a prior matting run),
    // so re-matting doesn't leak decoded image data.
    const prevUrl = newFrames[i].dataUrl;
    if (prevUrl.startsWith('blob:') && prevUrl !== sourceDataUrl) URL.revokeObjectURL(prevUrl);
    newFrames[i] = { ...newFrames[i], sourceDataUrl, dataUrl: URL.createObjectURL(transparentBlob) };
    if (onProgress) onProgress(`${verb} frame ${i + 1}/${newFrames.length}...`, newFrames);
  }
  return newFrames;
};

const mattingConfigForMode = (mode: MattingMode): Config => ({
  model: mode === 'conservative' ? 'isnet' : 'isnet_fp16',
  output: { format: 'image/png' },
});

async function removeAiBackground(sourceDataUrl: string, mode: MattingMode): Promise<Blob> {
  const res = await fetch(sourceDataUrl);
  const blob = await res.blob();
  const mattedBlob = await removeBackground(blob, mattingConfigForMode(mode));
  return mode === 'conservative'
    ? recoverForegroundEdges(blob, mattedBlob, EDGE_RECOVERY_RADIUS)
    : mattedBlob;
}

/** Fast color-key cleanup: sample the background from the four corners and
 *  flood-fill clear every border-connected pixel within the tolerance. Assumes
 *  the background reaches all four corners — a subject bleeding into a corner
 *  gets sampled as "background" and eroded; use an AI mode for those frames. */
async function removeEdgeBackground(sourceDataUrl: string): Promise<Blob> {
  const img = await loadImage(sourceDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is unavailable');
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  removeBorderConnectedColor(imageData, EDGE_KEY_TOLERANCE);
  ctx.putImageData(imageData, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode cleaned frame'));
    }, 'image/png');
  });
}

export function removeBorderConnectedColor(imageData: ImageData, tolerance: number): ImageData {
  const { width, height, data } = imageData;
  if (width === 0 || height === 0) return imageData;

  const bg = sampleCornerBackground(data, width, height);
  const tolSq = tolerance * tolerance * 3;
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const pidx = y * width + x;
    if (visited[pidx]) return;
    visited[pidx] = 1;
    stack.push(pidx);
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    push(0, y);
    push(width - 1, y);
  }

  while (stack.length > 0) {
    const pidx = stack.pop()!;
    const idx = pidx * 4;
    if (!matchesBackground(data, idx, bg, tolSq)) continue;

    data[idx + 3] = 0;
    const x = pidx % width;
    const y = Math.floor(pidx / width);
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }

  return imageData;
}

function sampleCornerBackground(data: Uint8ClampedArray, width: number, height: number) {
  const span = Math.min(8, Math.max(1, Math.floor(Math.min(width, height) / 4)));
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  const sampleRect = (x0: number, y0: number) => {
    for (let y = y0; y < y0 + span; y++) {
      for (let x = x0; x < x0 + span; x++) {
        const idx = (y * width + x) * 4;
        r += data[idx];
        g += data[idx + 1];
        b += data[idx + 2];
        count++;
      }
    }
  };

  sampleRect(0, 0);
  sampleRect(width - span, 0);
  sampleRect(0, height - span);
  sampleRect(width - span, height - span);

  return { r: r / count, g: g / count, b: b / count };
}

function matchesBackground(data: Uint8ClampedArray, idx: number, bg: { r: number; g: number; b: number }, tolSq: number) {
  const dr = data[idx] - bg.r;
  const dg = data[idx + 1] - bg.g;
  const db = data[idx + 2] - bg.b;
  return dr * dr + dg * dg + db * db <= tolSq;
}

export function expandAlphaMask(data: Uint8ClampedArray, width: number, height: number, radius: number): Uint8ClampedArray {
  const next = new Uint8ClampedArray(data);
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return next;

  for (let y = 0; y < height; y++) {
    const yStart = Math.max(0, y - r);
    const yEnd = Math.min(height - 1, y + r);
    for (let x = 0; x < width; x++) {
      const alphaIdx = (y * width + x) * 4 + 3;
      let maxAlpha = data[alphaIdx];
      const xStart = Math.max(0, x - r);
      const xEnd = Math.min(width - 1, x + r);

      for (let ny = yStart; ny <= yEnd; ny++) {
        for (let nx = xStart; nx <= xEnd; nx++) {
          const neighborAlpha = data[(ny * width + nx) * 4 + 3];
          if (neighborAlpha > maxAlpha) maxAlpha = neighborAlpha;
        }
      }

      next[alphaIdx] = maxAlpha;
    }
  }

  return next;
}

async function recoverForegroundEdges(originalBlob: Blob, mattedBlob: Blob, radius: number): Promise<Blob> {
  let originalImage: ImageBitmap | undefined;
  let mattedImage: ImageBitmap | undefined;
  try {
    [originalImage, mattedImage] = await Promise.all([
      createImageBitmap(originalBlob),
      createImageBitmap(mattedBlob),
    ]);
    const canvas = document.createElement('canvas');
    canvas.width = originalImage.width;
    canvas.height = originalImage.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return mattedBlob;

    ctx.drawImage(originalImage, 0, 0);
    const originalData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(mattedImage, 0, 0, canvas.width, canvas.height);
    const mattedData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const recovered = expandAlphaMask(mattedData.data, canvas.width, canvas.height, radius);

    for (let i = 3; i < originalData.data.length; i += 4) {
      originalData.data[i] = recovered[i];
    }

    ctx.putImageData(originalData, 0, 0);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob ?? mattedBlob), 'image/png');
    });
  } catch {
    return mattedBlob;
  } finally {
    originalImage?.close();
    mattedImage?.close();
  }
}

/** Apply a pixel-space crop to frames from the editor batch action.
 *  Reuses loadImage so a corrupt/revoked source rejects instead of hanging. */
export const cropFrames = async (frames: ExtractedFrame[], rect: PixelRect, selectedOnly = true): Promise<ExtractedFrame[]> =>
  Promise.all(
    frames.map(async (frame) => {
      if (selectedOnly && !frame.selected) return frame;
      // The data URL and its pre-matte source decode independently — load both at once.
      const [img, sourceImg] = await Promise.all([
        loadImage(frame.dataUrl),
        frame.sourceDataUrl ? loadImage(frame.sourceDataUrl) : undefined,
      ]);
      const cropped = cropToCanvas(img, rect);
      if (!cropped) return frame;
      const croppedSource = sourceImg ? cropToCanvas(sourceImg, rect) : undefined;
      return {
        ...frame,
        dataUrl: cropped.toDataURL('image/png'),
        sourceDataUrl: croppedSource?.toDataURL('image/png') ?? frame.sourceDataUrl,
        width: cropped.width,
        height: cropped.height,
      };
    }),
  );
