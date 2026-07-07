import { removeBackground } from '@imgly/background-removal';
import type { ExtractedFrame } from '../types';
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

export const batchRemoveBackground = async (
  frames: ExtractedFrame[],
  onProgress?: (msg: string, frames: ExtractedFrame[]) => void
): Promise<ExtractedFrame[]> => {
  const newFrames = [...frames];
  for (let i = 0; i < newFrames.length; i++) {
    if (!newFrames[i].selected) continue;
    if (onProgress) onProgress(`Matting frame ${i + 1}/${newFrames.length}...`, newFrames);

    const res = await fetch(newFrames[i].dataUrl);
    const blob = await res.blob();
    const transparentBlob = await removeBackground(blob);

    // Revoke the previous URL if it was one we created (a prior matting run),
    // so re-matting doesn't leak decoded image data.
    const prevUrl = newFrames[i].dataUrl;
    if (prevUrl.startsWith('blob:')) URL.revokeObjectURL(prevUrl);
    newFrames[i] = { ...newFrames[i], dataUrl: URL.createObjectURL(transparentBlob) };
    if (onProgress) onProgress(`Matting frame ${i + 1}/${newFrames.length}...`, newFrames);
  }
  return newFrames;
};

/** Apply a pixel-space crop to frames from the editor batch action.
 *  Reuses loadImage so a corrupt/revoked source rejects instead of hanging. */
export const cropFrames = async (frames: ExtractedFrame[], rect: PixelRect, selectedOnly = true): Promise<ExtractedFrame[]> =>
  Promise.all(
    frames.map(async (frame) => {
      if (selectedOnly && !frame.selected) return frame;
      const img = await loadImage(frame.dataUrl);
      const cropped = cropToCanvas(img, rect);
      return cropped ? { ...frame, dataUrl: cropped.toDataURL('image/png') } : frame;
    }),
  );
